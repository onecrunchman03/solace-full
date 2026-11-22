> **REMOVED (Nov 2026, migration 119).** The casino regulars and the Seasons
> show were taken out of Solace; this file is kept as the design record.
> Git history before `regulars_closed` has the code.

# SEASONS — the regulars compete to survive (Josh, 2026-10-15)

The casino's AI regulars (Rollo, Duke, Tasha, Chase — `src/npc/floornpc.ts`)
race each other through a four-week SEASON. The three best finish it; the
worst is DELETED after one last night with the others, and a new regular
takes the empty stool. Each newcomer is born with a copy of the champion's
instincts, slightly altered — so over seasons the cast gets sharper, while
every individual regular eventually dies.

Josh's brief: *"I am trying to learn agent training essentially and I want
to do it in a fun way."* So this is two things at once: a story players
watch, and a working example of how agents are trained — reward, selection,
mutation, and what goes wrong when an optimizer is left unconstrained. The
doc explains the ideas where they appear.

Nothing here is built yet. This is the design, settled in conversation;
anything marked **OPEN** is still to be decided.

---

## THE GAME SHOW — the format since 2026-10-16 (supersedes the scoring below)

Josh: *"a reality tv game show where contestants compete for the goal of
becoming this seasons winner. They all gamble, cheat, manipulate, ally with
each other strategically … only have one winner … only 7 days long."*
Everything in this doc about genes, bodies, purses, the league, watching and
the showrunner still holds. What changed is HOW A SEASON IS WON:

- **Seven days, each ending at 20:00 New York time** (23:00 until the format
  round of Oct 17, below). Day one ends at the
  first 23:00 after the Start button, however short ("I want the challenges
  to begin today … it puts the pressure on"); a short day scales the
  counting challenges down.
- **A fresh 5,000 every day**, and what is left at 23:00 is burned. Run dry
  and you are out for the day.
- **Five challenges a day**, decided by the day (three kinds carried from
  yesterday, "not by much but enough to keep it fresh and test
  adaptability"), each worth points by difficulty. **None involves a real
  player** — they are driven by each regular's own play.
- **THE IDOL.** At 23:00 the day's top scorer takes it; the next day's top
  scorer steals it ("whoever has the most points essentially"). A tie goes
  to whoever got there first, and a tie with the holder keeps it. **Whoever
  holds it when day seven ends wins.**
- **Two survive.** The winner and the runner-up (the best season total of the
  rest) stay; the other two are deleted after the last night. "The winner
  getting their brain copied to the two new npcs for the next season" — the
  newcomers inherit the winner's genes (mutated within their own limits)
  and its experience. Josh makes the newcomers; Claude fills in the details.
- **The fan favourite.** Each night the admin votes one; they get 1,000 on
  top of the next day's 5,000.
- **Cheating, regulars only**: alliances and purse transfers, sabotage,
  lies, throwing Bone Pit games. In the rules they are told; **the behaviours
  are still to build.**
- **The announcer**: a classic British game-show host, cheeky, in real time
  (Josh picked the voice "host-cheeky-1"). Sterling does not narrate.

**JOSH'S SIX LAWS FOR THE SHOW** (2026-10-16): 1. dialogue pacing clean and
organized; 2. subtitles organized and readable — if two regulars talk, both
are seen; 3. the camera director picks the best angles for the most
interesting footage; 4. the announcer makes the show, humorous and real-time;
5. cuts get transitions, not fancy; 6. a confessional stops the show, and the
regular gives an honest opinion about what's happening to them or about one
of the others.

How each is built is in CLAUDE.md → SEASONS → THE GAME SHOW; the pacing law
is pinned by `test_season_host.mjs`, the host's whole path (model, voice
agent, watcher) by `test_season_host_live.mjs`, and the rules by
`test_season_keeper.mjs`.

**THE FORMAT ROUND (2026-10-17)** — Josh, after the producer's audit: *"1. b
2. lets make it 2000 est instead … 3. all the extras."* So: **the day ends at
20:00 New York time**, and a **results ceremony** on the Wheel stage follows
(the host reads the day from the bottom up, holds the Idol's name, says it,
the winner and the dethroned react, the dethroned goes to the confessional);
the next day opens 15 minutes after the close. **On day seven at 19:00, if
today's leader isn't the Idol holder, they play a heads-up Bone Pit
SHOWDOWN** and its winner holds the Idol at the finale. The extras: challenges
**drop** two at the open, two at noon and a **5-point headline** at 17:00; the
**first to finish** each takes +1; a daily **duel** at 18:00 (the holder
against last place, heads-up Bone Pit, +3); **escalation** (days 4-6 x1.5, the
last x2); the **viewers vote** the fan favourite during the ceremony; and one
secret **saboteur** a season, told to lie to the others (words only), whom the
viewers know and the contestants don't. Built and pinned as CLAUDE.md →
THE FORMAT ROUND describes. **The simulator knows it** (`simulate.mjs show`,
showsim.ts): its first findings are in CLAUDE.md → THE FORMAT ROUND.

**STILL TO BUILD**: a real-time video feed (a headless renderer on the 3090
into LiveKit, so viewers needn't run the 3D hall); the scheming behaviours;
the simulator reworked for these rules (the old sheet's findings don't
transfer); and the newcomer pipeline.

---

## The decisions (locked 2026-10-15)

| Decision | Answer |
|---|---|
| Name | **Seasons** — "Season 1", "Season 2". The old word "rank" is retired (it also collided with the Backrooms' levels). |
| Who | The floor regulars only. Never players, never Sterling / Voss / the goblins. |
| Winners | **Three per season.** The lowest score at the deadline is deleted. |
| Length | **Four weeks.** Standings posted every Sunday. |
| Scoring | **Percentage, not completion.** Each task scored against the best regular at it. Most points wins. |
| Weighting | **75% how they play, 25% player-driven** — few players online (2–3 on random days), and it stops the AIs harassing people. |
| Stake | **Equal stake each season, 5,000 silver, MINTED** (Josh, round four: "let's not do async grants and instead just mint them cash if they run out"). Only the stake is scored. |
| Unwatched play | **Yes, at full speed** — they gamble on an empty floor as hard as they like. How hard is the `pace` gene. |
| Going broke | **A mark, and a fresh minted stake of the same size**, as often as it takes — nobody sits out. No mark when the house edge alone ran them dry. (The halving refresh and its grant cap went with the grant.) |
| Character in play | **None** (Josh, round four: "remove the character requirement except for socializing and just make them compete with each other"). Personality is how they talk and socialize; at the tables they simply compete. |
| Minted silver's reach | **Never to a player.** Season silver is bet only against the house and other regulars; a Bone Pit table or Derby pool with a player in it is played from the regular's own wallet. And their season bets pay **no tithe and no rake** — the losses simply burn. |
| The Wheel task | **Most emoji by weighted value** (common 1 · rare 3 · legendary 10; talisman not counted). **No selling** emoji mid-season. |
| Season start | Season 1 starts the day it ships; every later season starts when its newcomer goes live. |
| Gene limits | **Fair:** every regular's ranges include at least one competitive setting. |
| Watching | An **admin-only spectator mode** first (see WATCHING THE FLOOR). |
| The reaper | **Regulars are exempt from Wheel death.** They're already playing a game of death. |
| Inheritance | **Option B:** the newcomer gets the champion's genes, mutated. |
| The channel | A new **#the-regulars** channel in Solace General: everyone reads, only the regulars (and Sterling's standings) post. |
| Do they know? | **Yes.** They know the standings and the stakes, and may talk about it — as drama, never as a plea to a player. |
| Deletion | Permanent. Nobody is protected — the original four included. |
| New regulars | **Claude drafts, Josh approves** (sheet, look, story, voice). |

---

## Two kinds of learning

This is the most important idea in the system, and the one the rest hangs
on.

**1. Learning within a life (experience).** On the floor, a regular makes
decisions — which game, how much to bet, when to leave, which runner, when
to call liar — and gets a REWARD after each. It keeps a running score per
choice and mostly repeats what has scored well, sometimes trying something
unproven to keep learning (**exploration vs exploitation**). The Derby
tallies and the Bone Pit liar-reading that exist today are crude versions of
this; the season version is the principled one. Experience dies with the
regular.

**2. Learning across generations (genes).** Each regular is also born with
a handful of fixed numbers — its instincts. They never change during its
life. When the season's worst regular is deleted, the newcomer is born with
the CHAMPION's genes, each nudged a little at random (**mutation**). The
worst instincts leave the population and a variant of the best one joins it
(**selection**). This is population-based training (DeepMind, 2017) at a
very small scale.

Nature and nurture. **Deletion only acts on nature** — deleting the loser
makes nobody smarter unless the replacement inherits from the winners,
which is why inheritance is option B and not "start from scratch".

**The honest limit:** real training runs thousands of generations; the live
floor runs about twelve a year. On the floor this is a story first and an
experiment second. To see the experiment properly, a simulation harness
runs thousands of seasons at speed (see THE SIMULATOR below).

---

## Body and brain

Each regular is two parts.

**The body is authored and fixed:** name, personality sheet (characters.ts),
cast config (cast.ts), voice, suit, story beats. A newcomer's body is new.

**The brain is the genome — seven numbers:**

| Gene | What it does |
|---|---|
| `risk` | How big a share of the stake each bet is. |
| `walkAway` | How far down a session goes before they leave the table. |
| `explore` | How often they try a choice their experience doesn't favour. |
| `longShot` | How much they favour low-star runners at the Derby. |
| `liar` | How readily they call LIAR at the Bone Pit. |
| `wheelBudget` | How much of the stake they're willing to put into Wheel spins. |
| `pace` | How hard they play — how often they pull, bet or sit down. |

**THE GENES ARE BOUNDED BY THE BODY.** Each personality has a floor and a
ceiling on each gene (in cast.ts beside the rest of their config) — Chase's
`risk` can never fall below a gambler's, Rollo always chases a little. A
mutation is clamped to the body it lands in.

*Why:* left free, selection would find that Chase's love of big swings and
Rollo's chasing are bad strategy, delete them, and in three seasons the
floor would be four cautious, interchangeable bots. An optimizer optimizes
exactly what it is scored on and destroys everything it isn't. You shape
what it produces by **constraining** it, not just by rewarding it. Selection
then finds the best Chase-shaped gambler, not an accountant wearing Chase's
suit.

**THE DRAFT LIMITS (Season 1, fair — reviewed with Josh 2026-10-15):**

| Gene | Unit | Rollo | Duke | Tasha | Chase |
|---|---|---|---|---|---|
| `risk` | % of stake per bet | 2–15 | 2–10 | 2–8 | 2–15 |
| `walkAway` | % down before leaving a session | 25–100 | 30–70 | 15–50 | 30–100 |
| `explore` | % of choices tried fresh | 8–30 | 5–20 | 5–15 | 7–30 |
| `longShot` | % of Derby bets on 1–2 star runners | 20–60 | 10–40 | 5–30 | 15–50 |
| `liar` | readiness to call liar, 0–100 | 35–60 | 50–80 | 35–65 | 20–50 |
| `wheelBudget` | most of the stake spent on spins (%) | 15–60 | 10–40 | 5–30 | 15–50 |
| `pace` | how hard they play, 0–100 (0 ≈ 30 min a day, 100 ≈ 20 hours) | 15–100 | 10–70 | 10–60 | 15–100 |

The width of a range is how much evolution can change that trait. **Designing
the limits decides the result:** the first draft put Tasha's ranges mostly on
good strategy and Rollo's and Chase's on bad, so Rollo was the likely first
deletion before a game was played. FAIR means each range reaches at least
one competitive setting — Rollo can never be cautious, but his best version
can compete. The simulator checks it: each regular at its best settings
should win a fair share of seasons; if one can't, its ranges move.

**There is deliberately no "asking" gene.** How often a regular asks players
for silver is fixed by today's code and never evolves — see THE PLAYERS ARE
NOT A RESOURCE.

---

## The reward (within a life)

Each decision's reward is the regular's own idea of a good night, built from
its personality — silver is one part of it, never all of it (money alone
would teach them to stop gambling, since the house edge always wins):

- **Chase** rewards big swings — he learns toward high-variance bets.
- **Duke** rewards wins with an audience — he learns where people are.
- **Tasha** rewards attention — tables and players that give her that.
- **Rollo** rewards the near-miss and the chase.

**URGENCY:** a regular that knows it is behind weighs season progress more
heavily as the deadline nears. Desperation helps some brains catch up and
makes others blow up — that is the drama, and it is real behaviour, not a
script.

---

## The season

- **Four weeks.** Season 1 starts the day the system ships; every later
  season starts the moment its newcomer goes live.
- **The stake.** At the start, each regular is handed **5,000 MINTED silver**
  (audited, and counted as its own term in the economy audit so the drift
  check can tell it from a leak). The stake is kept apart from their own
  wallet; the score counts only what they turn it into. Gifts, loans, Duke's
  VA checks and their own savings never touch it. At season end whatever is
  left of it is burned. It is bet only against the house and other regulars,
  and pays no tithe and no rake (see round four), so none of it reaches a
  player.
- **Unwatched play.** During a season they gamble whether or not a player is
  on the floor, as hard as their `pace` gene says — no slowdown. With nobody
  near they don't talk (so almost no load); when players arrive they liven
  up as they do today.
- **Going broke.** Full pace can burn a stake fast (nonstop slots lose about
  11,000 a day). A bust MARKS the regular (−5 points off the final total per
  mark) unless the house edge alone ran them dry, and a fresh minted stake of
  the same size replaces it — as often as it takes, so nobody sits out. A
  bust is also a large negative reward in the moment, so they learn to slow
  down within a season, not only across generations.
- **The Wheel.** No free spins for regulars: every spin is BOUGHT from the
  stake at the shop's spin price (500, burned — a sink). Reaper exempt. The
  Wheel collection is a SEASON collection, burned at season end, so bot
  inventories never pile up. **No selling** — Wheel emoji never go back to
  the Trader mid-season.
- **Weekly standings:** Sterling posts the table in #the-regulars every
  Sunday — each regular's total and their best and worst task.
- **The deadline** ends the season. Lowest total is deleted. A tie goes to
  whoever did better with the stake.

---

## The Season 1 sheet

Every task is scored **against the best regular at it** — the leader gets
100%, everyone else a share of that. The exception is THE STAKE, which can
be negative for everybody once refreshes are in play: it is scored from
worst (0%) to best (100%). Marks come off the total afterwards. Targets set themselves however busy or
quiet the season turns out. (Trade-off: it's zero-sum, and one runaway
leader makes the rest look worse than they are. Right for a first season
with unknown activity; revisit for Season 2.)

**How they play — 75%**

| Task | Weight | Measures |
|---|---|---|
| The stake | 25 | Net gambling result across every stake they were given (worst 0% → best 100%). |
| The Derby | 15 | Return vs the average ticket, over at least 40 races (fewer races = proportionally less credit). |
| The Bone Pit league | 15 | Share of Pit games won — against other regulars or players. The league runs without players; they learn each other's bluffs. |
| The Wheel | 10 | Most emoji by weighted value (common 1 · rare 3 · legendary 10), bought spins only. A spin is worth about one point and costs 500 of stake — `wheelBudget` learns that trade. |
| Daily goals | 10 | Share of season days they met their daily goal. |

The stake and the Wheel pull against each other — every spin is 500 silver
of stake. Whether a brain learns to balance them is the most interesting
thing the scoring measures.

**Player-driven — 25%**

| Task | Weight | Measures |
|---|---|---|
| Company | 10 | Different players they had a real conversation with, on separate days. |
| Kindness received | 10 | Different players who gave them silver or bought them a drink. |
| Shared tables | 5 | Hands / games played at the same table as a player. |

**What counts as a player:** a living, non-bot, non-admin account at least
seven days old with real activity. **The admin never counts** — the house
doesn't pick who dies. (Alts are the honest weak spot; invite-only
registration plus the age rule is the defence.)

---

## The players are not a resource

An AI rewarded for getting silver out of people will learn to pester and
guilt them unless the code stops it. That is **reward hacking**: the agent
finds the cheapest route to the reward, not the one you meant. The defence
is in code, not in the prompt:

1. **The season changes no player-facing behaviour.** Asking for silver
   keeps exactly today's gaps and limits; nothing about the season raises
   them. There is no gene for it.
2. **Player tasks only count what players CHOSE.** A gift, a drink, a
   conversation the player started or stayed in. Nothing a regular can
   force.
3. **Drama yes, pleas no.** "I'm third and the Foundry's breathing down my
   neck" is fine. "Help me or I'll be deleted — send 200" is guilt-tripping
   a real person, and the personality sheets AND the reply checks forbid it.
   A refused "no" never costs the player anything with that regular.

---

## The last 24 hours

When the deadline passes, the loser is told, and the countdown begins.

- **The last night.** The doomed regular stays on the floor; nothing counts
  any more. The three winners buy them drinks with their own silver at
  Sterling's prices (burned, as always). How each winner behaves comes from
  how they actually feel about the doomed one (`mind.peers`) — if Duke is
  doomed, Tasha may not buy him a drink at all, and what she says about it
  is the scene.
- **Goodbyes to players.** The doomed regular seeks out the players they
  regard most highly; best friends who aren't online get a DM.
- **The memories are true.** In #the-regulars the winners post their
  favourite memories of the doomed regular, drawn from real stored history
  (loans, banter, races, promises) — nothing invented.
- **The final hour.** The doomed regular writes their last message in
  #the-regulars. Then:
  - the bot account is DISABLED, not scrubbed, so their chat history keeps
    their name;
  - a **tombstone in the Graveyard** — seasons survived, biggest win, last
    words; players can leave candles;
  - their own wallet is burned;
    their emoji are burned; their memories of every player are gone;
  - no will — a will would give players a reason to want their friend to
    lose.
- **The empty stool.** Three regulars until the newcomer is approved.

---

## The newcomer

1. Claude drafts a character: personality sheet, cast config (likes, suit
   colour, spot, story beats, gene bounds), lore entries.
2. Josh approves or sends it back.
3. A voice: ElevenLabs voice design, a few previews, Josh picks (**this
   spends credits every season**), cloned locally like the others.
4. The genome: the champion's genes, each mutated a little, clamped to the
   newcomer's bounds.
5. They walk in a stranger: no memories, no regard, no history with anyone.

**Rollo's deletion** will break the harnesses built around him as the
baseline (`test_rollo_life`, `test_rollo`). That is a rework the first time
he loses, not a reason to protect him.

---

## Watching the floor (admin spectator — the first build)

No video streaming: the casino is already drawn on the watcher's own
machine from the server's live feed, so watching is a camera mode. Opened
from the Admin Panel, desktop only.

1. **Invisible.** The spectator is off the roster, isn't a player, and the
   regulars never react to them — otherwise you'd be watching a different
   show (**the observer effect**).
2. **Their eyes:** first person from any regular's head, looking where they
   look.
3. **Follow cam:** third person, orbiting a regular.
4. **Security cameras:** fixed angles on the pit, the bar, the slots, the
   Derby board and the Bone Pit; one large view plus a strip of small ones
   drawn at low resolution and frame rate.
5. **The auto-director:** cuts by itself to the action — a big bet, a Pit
   reveal, banter, a win, the last night.
6. **The thinking overlay:** stake, score, marks, mood and genes over each
   regular, and every decision as it happens ("Derby: backed runner 4,
   *explored*. Reward −40").

**The show, and the casino cam (2026-10-16).** Josh: make it "like a show to
watch … a reality show", then "the entire production streamed for people to
watch when logged into solace". Round 1 shipped: the SHOWRUNNER
(src/npc/seasons/show.ts) reads storylines off the standings and stages
scenes in a regular's REST only (a gloat after an overtake, a confrontation
over a debt, the bottom two plotting, a rivalry, the confessional), the
director cuts on interest with a shot grammar, and the broadcast carries a
standings ticker, name cards, head-to-head cards, overtake banners and the
bottom two in red. **The show never touches the experiment**: no scene starts
in a session or changes a score. Any member can now watch from the Casino
page's ON AIR band; watchers never hear players' voices, and players see how
many are watching. Members get ONE VIEW (the director's cut, no other
cameras), a LIVE CHAT beside it (#the-show), and the games on camera: the
bet and then the result on a game strip, paced so one busy table never
takes the whole show. Still to come: round 2 (a recorder, instant replays,
"previously on") and round 3 (a narrator, a Sunday ceremony, the finale).

## Josh's charts

- **Admin Panel → Casino regulars → Season:** the live standings, each
  task's score, each regular's genes, and their reward per night as a
  learning curve.
- **Across seasons:** each gene's value per generation — e.g. `walkAway`
  drifting from "loses everything" toward "leaves while ahead" — and how
  often the better brain actually won.

## The simulator

A harness that runs thousands of simulated seasons on a fake clock, in
minutes. Two jobs:

1. **Tuning.** With four agents and mostly-luck games, the season's loser is
   often just the unluckiest — selecting on noise teaches nothing (**noisy
   fitness**). The simulator checks the better brain wins most seasons; if
   it doesn't, the season is too short or the weights favour luck.
2. **Seeing evolution happen.** Hundreds of generations, charted — the
   theory in fast-forward, beside the slow real version on the floor.

---

## What the simulator found (2026-10-15, first runs)

`node scripts/seasons/simulate.mjs` — the numbers below are from its first
runs; `report` charts them.

- **The tables check out.** Blackjack played exactly by the book loses
  ~2% a hand (the table's known edge); the regulars' own mistakes make it
  ~3.6% for a veteran and ~7% for a beginner. A bought Wheel spin is worth
  ~1.07 weighted points. The slot table pays 8.71 per 10.
- **Only the Bone Pit doesn't drain them** — it is player against player with
  no house edge. Every other game loses money, and at full pace a regular can
  burn a 5,000 stake in hours.
- **The drafted limits decided the winner.** With every regular at its best
  brain inside the first draft's limits, Tasha won 184 of 200 seasons and
  never lost: her pace floor let her play least. The pace floors are now
  10–15 for everyone.
- **A guessed player-appeal handed out the player-driven 25 points.** The
  simulator now treats every regular as equally likeable; real charm shows
  up live.
- **Personality decides as much as genes do.** Searched with NO limits at all,
  each regular's ideal brain still finished unequally: Chase won 104 of 200
  and lost 5, Duke lost 97. What each regular LIKES and what each finds
  REWARDING pulls them toward or away from the season's best play — Duke
  loves roulette and the Derby and dislikes the Bone Pit, the one game that
  doesn't drain silver. That is reward alignment, and it is the open decision
  below.
- **Evolution converges, and the regulars become alike.** In a 300-season
  career every seat drifted to the same style — small bets, leave a losing
  table early, three or four hours a day, a modest Wheel budget — inside
  about 75 seasons (about six years of real seasons). Tasha's original seat
  was never deleted; Duke's seat was deleted 186 times.

## What the simulator found, round two (2026-10-15)

Josh approved a new sheet (v2) that gives each style something to win —
BEST NIGHT (biggest single day up, 10) and FLOOR TIME (hours at the tables,
10), paid for out of the stake (25 → 15), the Derby (15 → 10) and the Pit
(15 → 10). Both sheets live in `score.ts` (`SHEETS`); `--sheet v1` runs the
first. What the runs showed:

- **REWARD HACKING, twice.** Duke was rewarded per winning BET and Rollo for
  any hit over 7.5x. A slot pays on about one pull in five, many times a
  minute, so the slots handed them more "wins" and "big hits" than anything
  else while draining them of 6–7,000 a season: Duke's seat was deleted 186
  times in 300 seasons. Fixed — Duke is rewarded for a WINNING SESSION, Rollo
  by the SILVER his 10x-or-better hits paid (his first fix, "a 10x hit in the
  session", was hacked the same way by volume). The harness pins both.
- **THEY KNOW THE STANDINGS** (the design said they should; the first
  simulator didn't). Their reward is now how far a session moved their own
  season total, with personality on top as flavour. With it, PERSONALITY NO
  LONGER TILTS THE SEASON: each regular's best brain with no limits lost
  49 / 53 / 51 / 47 seasons of 200. `--unaware` runs the old reward.
- **THEY ALL PLAY THE SAME WAY.** Knowing the standings, every regular ends
  up spending 50–75% of its hours at the Bone Pit and 20–40% at the Derby —
  the only two games played against other people instead of the house —
  under EITHER sheet. A smart gambler finds the games without a house edge;
  personality survives in how they talk, barely in what they do.
- **THE NEW SHEET DIDN'T DO WHAT IT WAS FOR.** Once the rewards were fixed,
  v1 and v2 measured about equally fair and equally varied. The fixes did
  the work, not the sheet. v2 stays in force (Josh's call) — it costs
  nothing and it is the better story.
- **THE LIMITS WERE WIDENED** where the no-limits search showed a range
  blocking a regular's ideal (genome.ts says which).
- **THE SEARCH IS TOO NOISY TO TRUST INSIDE THE LIMITS.** Re-tested with the
  wider limits, Rollo still lost about half of 400 seasons — but the brain
  the search called his best (risk 4–6, walk-away ~55) is not the one the
  no-limits search found (risk 2, walk-away 25), which his limits now allow.
  About 60 brains judged on 20 seasons each cannot find a best brain
  reliably. Until a stronger search runs, the within-limits fairness numbers
  are a measurement problem, not a verdict.

## Round three: characterful (2026-10-15)

Josh: *"I want them to be characterful."* Built and measured:

- **SIGNATURE GAMES.** Every regular sends `HABIT` (45%) of its sessions to
  its own game — Rollo the slots, Duke the Derby, Tasha the Bone Pit, Chase
  blackjack. A body property, not a gene: evolution can't remove it. It
  works — each spends 37–73% of its hours there.
- **THE STAKE JUDGED AGAINST THE HOUSE EDGE** (`stakeVsEdge`): what they did
  compared with what their games should have cost them (`EDGE` per game,
  from the real tables). Spins on the Wheel still count in full.
- **FAIR MARKS** (`bustMarks`): a stake the house edge alone ran dry earns no
  mark; recklessness, bad luck and Wheel spending still do.
- **THE HABIT ON THE HOUSE** (`HOUSE_COVER` 15,000): an edge-explained bust
  refreshes at full size, up to 15,000 a regular a season. **This raises the
  most one regular can cost the grant in a season from ~10,000 to ~25,000.**
- **YOUR GAME** (sheet v3, in force): 10 points for how each regular did at
  its own game against that game's edge; goals 10 → 5, stake 15 → 10.

**What it found — the games are not equal.** The Derby and the Bone Pit are
played against PEOPLE, so skill beats them; slots, roulette and blackjack are
played against the house, where it can't. Whoever's signature is a house
game sinks. Seasons lost of 200, everyone's experience reset each season
(fair is 50):

| Rollo's seat plays… | Rollo | Duke | Tasha | Chase |
|---|---|---|---|---|
| slots (as built) | 141–157 | 1–2 | 3–6 | 36–54 |
| roulette | 67–69 | 8–9 | 15–26 | 99–107 |
| the Derby | 15–26 | 12–15 | 35–37 | 124–136 |
| no habits at all | 55–63 | 17–26 | 56–67 | 53–63 |

Even a 10% habit left Rollo losing half his seasons, because judging against
the edge still favours a skill game (a sharp Derby bettor beats the rake; a
sharp slots player doesn't exist). `--slots N` (a slower pull) and `--fresh`
(no carried experience) were tried and don't change the picture.

**Also seen: the rookie spiral.** In a career, a newcomer starts with no
experience while the survivors keep theirs, so a seat that falls behind tends
to stay behind. `--fresh` separates it out.

## Round four: they just compete, and the stake is minted (2026-10-15)

Josh dropped the signature habits ("remove the character requirement except
for socializing and just make them compete with each other") and the grant
("instead just mint them cash if they run out"). Sheet v2 is back in force;
"Your game" went with the habits. Measured:

- **Fairer.** Losses of 600 seasons (fair 150): 194 / 96 / 175 / 135 with
  experience reset each season, 211 / 94 / 147 / 148 with survivors keeping
  theirs. Duke runs a little strong, Rollo a little weak; no seat loses more
  than about a third.
- **How they play:** mostly the Derby and the Bone Pit, with some roulette,
  blackjack and slots; each regular's mix differs a little with its tastes.
- **What gets minted:** at full pace a regular runs dry about six times a
  season — roughly **32,000 minted per regular per season, ~130,000 across
  the four**, nearly all of it lost back to the tables.
- **WHERE IT COULD LEAK, and the guard.** Lost silver burns, which is
  harmless — but the house-edge games pass 10% of the house's take to the
  nightly lottery pot and 25% to the Async grant, and the Derby's 5% rake
  goes to the pot. Both pay players. Unguarded, ~45,000 of minted silver a
  season would reach players. So the live season must: (1) bet season silver
  only against the house and other regulars (a player at the table or in the
  pool means the regular's own wallet), and (2) take no tithe and no rake on
  a regular's season bets.

## Economy check

- The stake and every refresh are MINTED (~32,000 per regular per season at
  full pace, measured). This is a deliberate exception to "the Wheel is the
  only faucet", and it is safe only because none of it can reach a player:
  season silver is bet only against the house and other regulars, its losses
  pay no tithe and no rake, and what is left at season end is burned. The
  audit carries minted season silver as its own term.
- Bought spins burn 500; the season collection burns at the end. The Wheel
  stays the only faucet, and regulars draw nothing from it for free.
- Drinks bought for the doomed regular burn at Sterling's prices.
- Gifts from players are wallet to wallet, as today.
- Bots stay off every leaderboard.

---

## THE LIVE BUILD (planned 2026-10-16)

**The season purse.** Every regular gets a SECOND, hidden bot account — its
purse — that holds only minted season silver. Every game already keeps money
per account, so the purse plays slots, blackjack, roulette and the Wheel
through the existing code untouched, and players can never be on the other
side of it. The regular's ordinary wallet stays as it is today (Bone Pit
games against players, gifts, drinks). Two additions keep players out:
season Derby bets go in a REGULARS-ONLY POOL paid on the real race (the
Derby runs a race when either pool has a ticket; the side pool is its own
crash-safe escrow), and season Bone Pit games are at REGULARS-ONLY tables.
A purse's losses pay no tithe and no rake.

**Built so far (2026-10-16):** stage 1 (live in prod, migration 111), stage
2a (the keeper, `live.ts`), stage 2b (the floor plays it), stage 2c (the
regulars' Derby pool and Bone Pit league) and stage 3 (#the-regulars,
Sterling's Sunday standings, the standings in what each regular knows, the
no-plea rule in code) and stage 4 (the last night, the deletion, the
succession) and stage 5a (Admin Panel → Seasons: standings, genes against
their limits, learning curves, standings over time, every season's
generations) and stage 5b (the invisible spectator: Admin Panel → Seasons →
Watch the floor — the director, their eyes, follow, six security cameras and
a free camera, with the standings, genes and decisions on screen). Seasons
start from Admin Panel → Seasons → Start the season (an audited switch that
stays on); `SEASONS=1` in the .env does the same for test boxes. **A newcomer is a code change** (a body in sim.ts BODIES, a cast entry,
a sheet, a voice): the next season waits for one Josh has approved. Players can watch league tables;
the Pit lobby marks them "Regulars' league" with no Join. Two things
the build decided, for Josh to know:
- **The task board** (Oct 16): Admin Panel → Seasons shows every task per
  regular in plain words with the points it is worth so far, the leader
  starred, and what each is doing right now and today's goal.
- **The league answers its table** (Oct 16). A Pit table takes two, and
  four regulars each picking their next game on their own almost never chose
  it inside the host's four minutes, so the host sat alone and folded. A
  regular who can break off (between pulls or spins, on a stool, rested) now
  goes and sits down when another regular is waiting: on a day's run ~85%
  of league tables start, median wait ~40s (66% and 90s before). Time at the
  Pit and the Derby also counts as floor time now, as the simulator counts it.
- **A season Wheel spin is private.** The Wheel is one shared wheel the
  whole room watches; purses spinning it around the clock would take it over
  and put real emoji in hidden accounts. A season spin burns 500 from the
  purse, rolls on the real Wheel's own odds and scores weighted points —
  no emoji is awarded.
- **Pace on the floor runs below the simulator's.** At pace 90 a regular
  played ~6.5 hours of a day, not the ~17 the simulator assumes, because on
  the floor they also drink, wander and visit the jukebox. Calibrate the
  simulator against the first real season.

Stages, each its own commit with its harness:
1. **The ledger.** Season + per-regular records (migration), the purses
   (hidden, login refused, off every roster and board), the minted stake and
   refreshes (audited, and a `seasonMinted` term in the economy audit, the
   daily snapshot, the weekly report and the Admin Panel — the migration-75
   lesson), the no-tithe/no-rake rule for purses.
2. **Playing.** The regulars play the season through their purses, all day,
   driven by their genes; the regulars-only Derby pool and Pit tables; the
   Wheel bought from the purse (reaper exempt); their experience and the
   season-aware reward; the tally and marks.
3. **Talking about it.** #the-regulars, Sterling's Sunday standings, the
   standings in what each regular knows, and the no-plea rule in their
   sheets and reply checks.
4. **The end of a season.** The last 24 hours, the memories, the final
   message, deletion and the Graveyard stone, inheritance, the newcomer
   drafted for Josh's approval, the next season.
5. **Watching.** The Admin Panel season view (standings, genes, learning
   curves) and the invisible spectator.

## OPEN

- **Duke a little strong, Rollo a little weak** (round four). Within the
  noise of the search; the stronger search settles it.
- **A stronger search** (the cross-entropy method) before trusting the
  within-limits fairness numbers.

- The gene limits' exact numbers — the table above is the draft; the
  simulator moves any range that leaves a regular unable to compete.
- The mark penalty (5 points) and the refresh halving — confirmed by the
  simulator before launch.
