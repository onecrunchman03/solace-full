# THE LORA PROJECT — teaching the 12B to sound like the 26B

Josh, Oct 2026: *"Start the Lora project."* This folder is the whole pipeline,
written to be learned from as much as used.

## The idea, in one paragraph

Slopbot's 3080 runs `gemma4:12b`. Your 3090 Ti runs `gemma4:26b-a4b-it-qat`,
which writes the three characters noticeably better. We **distil**: run the
real Solace pipeline with the 26B as the *teacher*, record exactly what the
server sent it and what it answered (only answers that passed the server's
checks), let a human keep the good ones, then train a small **LoRA adapter**
on the 12B with those examples. If it works, the 12B — the engine that answers
whenever your PC is off — sounds like the 26B, and the 26B is freed for other
work (Rollo, the director).

Because the recorded prompts are exactly what production sends, a trained
adapter drops into production with **no code change**: point
`NPC_BRAIN_MODEL` at the new model name, and `scripts/npc-eval.mjs` measures
whether it actually helped.

## The steps

| # | Step | Tool | Where it runs |
|---|------|------|---------------|
| 1 | **Collect** — generate patron lines per character, ask them through a throwaway Solace server whose brain is the 26B behind a recording proxy | `collect.mjs` | this PC (uses the 3090 Ti's Ollama) |
| 2 | **Curate** — read every example, keep / edit / drop | `review.mjs` → http://localhost:8792 | this PC, any browser |
| 3 | **Train** — QLoRA on the 12B with the kept examples | `train.py` (Unsloth) | this PC's 3090 Ti (pause the NPC engine first: `solace-gpu.ps1 -Pause`) |
| 4 | **Package** — merge to GGUF, `ollama create` a new model on slopbot | `package.md` | slopbot |
| 5 | **Judge** — run the eval battery on 12B, 12B+LoRA and 26B; keep the adapter only if it wins | `node scripts/npc-eval.mjs --model …` | this PC |

## The rules (they are the same rules as everything else in the house's brains)

- **No private data.** Every example comes from synthetic players on a
  throwaway server — never from production DMs. The Privacy Policy promises a
  player's private conversations are only used in that player's own
  conversation, and a trained model can't be made to forget.
- **No secrets.** The prompts are production prompts, which already carry no
  relic locations, keys or creature rules. Nothing is added here.
- **Facts stay facts.** The adapter learns the *voice*. Prices and balances
  keep arriving as FACTS at run time, because a trained-in number is stale
  the day the economy is retuned.
- **The eval is the judge**, not a feeling. An adapter that does worse on the
  battery doesn't ship.

Data lives in `data/lora/` (gitignored, like the rest of `data/`).
