# The survivors' bibles

One file per survivor: who they are, how they talk, what they know, what they
want and fear, who they are to the others, and where four weeks could take
them. These are the raw material for each survivor's **sheet** (the short
prompt sent with every line they say) and their **library** (longer entries
that ride along only when they're relevant), the way the casino regulars and
Sterling are built (`docs/npc/`). Nothing here reaches a model until the
sheets are written from it, after Josh has read and changed it.

Each line is marked with where it came from:
- **[J]** Josh's own words or decisions (SURVIVORZ.md, his answers). Settled.
- **[C]** canon already in the design (SURVIVORZ.md ✱ lines, the lore).
- **[N]** new, written to fill them out. **These are the lines to check, cut
  or rewrite.**

Two rules from the design hold in every file:
- **Conflict is about personality** (leadership, trust, pride, fear), never
  race. The bibles describe who people are, not their ethnicity.
- **The cast is crude, the line is not crossed.** They swear and joke the way
  the casino regulars do; the content line (nothing sexual with minors,
  without consent, with animals or within family) is held in code, as it is
  today.

The genes (SURVIVORZ.md §7, `src/survivorz/genes.ts`) are the numbers behind
each person's choices; each bible says in words what their genes mean for
them, and which way they're most likely to drift.

## Where they start with each other

Regard runs -100 (can't stand them) to +100 (would die for them), the casino
regulars' scale. It moves with what happens; these are day one. **[N]**, built
from the design's starting relationships **[C]**.

| From → to | Johanna | Dale | Ben | Rick | Sarah | Rollo |
|---|---|---|---|---|---|---|
| **Johanna** | — | 10 | 15 | 50 | 40 | 0 |
| **Dale** | 15 | — | 0 | 10 | -5 | 0 |
| **Ben** | 10 | 5 | — | 45 | 35 | 10 |
| **Rick** | 30 | 15 | 25 | — | -15 | -5 |
| **Sarah** | -15 | 0 | 25 | 20 | — | -10 |
| **Rollo** | 10 | 5 | 15 | 10 | 20 | — |

## How they came to be together [J]

They found each other in the city centre as Atlanta fell. **Rick** stood up
first, and his leadership got them out; he has held them together since.
**Rollo** joined later: his escape pod came down in a city park, they found
him, and he tagged along. Running from the dead through the old transit
tunnels, they found Halcyon Site 9's vault standing open, rushed in and shut it
behind them. Somebody inside had opened it days earlier (the first mystery).

## Files

- [johanna.md](johanna.md)
- [dale.md](dale.md)
- [ben.md](ben.md)
- [rick.md](rick.md)
- [sarah.md](sarah.md)
- [rollo.md](rollo.md)
