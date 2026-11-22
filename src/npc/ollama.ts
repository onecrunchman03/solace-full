// THE HOUSE'S BRAINS — the wire to the models (Oct 2026).
//
// Sends a chat to one Ollama endpoint, gets text back, or throws. Everything
// that decides WHAT to say, and WHICH endpoint says it, lives in brain.ts.
//
// TWO ENDPOINTS (Josh, Oct 2026 — "I like option A"):
//   · STEADY — slopbot's RTX 3080 (10 GB), always on: gemma4:12b.
//     NPC_BRAIN_URL / NPC_BRAIN_MODEL.
//   · BIG — the RTX 3090 Ti (24 GB) in Josh's workstation: a 26–31B model
//     and a longer context. NPC_BRAIN_BIG_URL / _MODEL / _CTX. It is
//     OPTIONAL and comes and goes — the PC sleeps, reboots, and steps aside
//     for a heavy game (the game-mode watcher stops its server) — so nothing
//     may ever depend on it being there.
//
// THE OPTIONS ARE CONSTANT PER ENDPOINT. Ollama keys a loaded model on its
// options, and a request with a different num_ctx unloads and reloads it —
// a minute of silence on the 3080. So every call to an endpoint sends that
// endpoint's num_ctx; only sampling (temperature, num_predict) varies.
//
// keep_alive -1: these GPUs exist for the three characters, so a loaded
// model never unloads on its own. (Game mode stops the BIG server outright.)

import { config } from "../config";

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Endpoint {
  name: "big" | "steady";
  url: string;
  model: string;
  /** The context window this endpoint always runs at. */
  numCtx: number;
}

export interface ChatOpts {
  /** Hard cap on generated tokens. */
  maxTokens: number;
  temperature: number;
  /** Ollama's structured output: a JSON schema the reply must match. */
  format?: object;
  signal?: AbortSignal;
}

/** The steady endpoint's window. Also the smallest any prompt is built for
 *  when it might land on either endpoint. */
export const NUM_CTX = 4096;

export class BrainUnavailable extends Error {
  /** True when the endpoint couldn't be reached at all (refused, reset, DNS)
   *  rather than being slow — the case where the other endpoint should be
   *  tried at once. */
  constructor(message: string, readonly unreachable = false) {
    super(message);
  }
}

const trimUrl = (u: string) => u.trim().replace(/\/+$/, "");

/** Every endpoint configured, steady first. */
export function endpoints(): Endpoint[] {
  const out: Endpoint[] = [];
  if (config.npcBrainUrl.trim()) {
    out.push({ name: "steady", url: trimUrl(config.npcBrainUrl), model: config.npcBrainModel, numCtx: NUM_CTX });
  }
  if (config.npcBrainBigUrl.trim()) {
    out.push({ name: "big", url: trimUrl(config.npcBrainBigUrl), model: config.npcBrainBigModel, numCtx: config.npcBrainBigCtx });
  }
  return out;
}

/** Is any model configured at all? None = the brains are off. */
export function brainConfigured(): boolean {
  return endpoints().length > 0;
}

export async function chat(ep: Endpoint, turns: ChatTurn[], opts: ChatOpts): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${ep.url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify({
        model: ep.model,
        messages: turns,
        stream: false,
        // Gemma 4 and Qwen 3.5 can "think" before answering; a shopkeeper
        // doesn't, and the hidden reasoning would double every reply's time.
        think: false,
        keep_alive: -1,
        format: opts.format,
        options: {
          num_ctx: ep.numCtx,
          temperature: opts.temperature,
          num_predict: opts.maxTokens,
        },
      }),
    });
  } catch (e) {
    // Aborted (our own deadline) is slowness, not absence.
    const aborted = opts.signal?.aborted ?? false;
    throw new BrainUnavailable(`${ep.name}: ${(e as Error).message}`, !aborted);
  }
  if (!res.ok) throw new BrainUnavailable(`${ep.name}: HTTP ${res.status}`, res.status === 404);
  const data = (await res.json()) as { message?: { content?: unknown } };
  const text = data?.message?.content;
  if (typeof text !== "string") throw new BrainUnavailable(`${ep.name}: no content`);
  return text;
}

/** Reachable, and is the model loaded? (unreachable → reachable: false) */
export async function endpointState(ep: Endpoint, signal?: AbortSignal): Promise<{ reachable: boolean; loaded: boolean }> {
  try {
    const res = await fetch(`${ep.url}/api/ps`, { signal });
    if (!res.ok) return { reachable: false, loaded: false };
    const data = (await res.json()) as { models?: { name?: string; model?: string }[] };
    return { reachable: true, loaded: (data.models ?? []).some((m) => m.name === ep.model || m.model === ep.model) };
  } catch {
    return { reachable: false, loaded: false };
  }
}
