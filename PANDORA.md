# PANDORA'S BOX — the endgame of Solace v1 (Josh's brief 2026-09-17, digested)

A new rail section under THE HUB. A box with three keyholes. Three keys, one
from each pillar of the game — the collection, the games, the worlds. Every
key comes with a note from Sterling. Drag a key to its keyhole and it snaps
in; three in and the box glows with the aura of the myth; click it and it
opens on a light, Sterling announces the opener in #general, the opener is
issued THE PANDORAN suit, and then chooses ONE thing that changes Solace for
everyone. World choices are once-ever, server-wide. The ledger under the box
is the monument.

This is the last thing v1 adds. After it: the experience, bugs, performance,
and the eight Backrooms levels still to build. v2 is a new game and hub
expansions, later.

---

## The keys

| Key | Source | Rule |
|---|---|---|
| **Prismatic Key** | THE VIP ROOM, Tier 4 | `users.vipTier` reaching 4 — every emoji in the catalog plus every relic the maps hold (`src/vip.ts`). Stamped by `raiseVipTier`, so the key grants off the same seam. |
| **Brass Key** | Every achievement | Every EARNABLE badge in `ACHIEVEMENTS` earned. Retired badges (`retired: true` — Crowned, Dynasty, the Pit crown's) are excluded. A badge added later never revokes a key already held. |
| **Rusted Key** | The Backrooms, complete | Every relic on every level: **`RUSTED_RELICS` = 100 across `RUSTED_LEVELS` = 10** (Josh: "by completing the level i mean getting all the relics for that level"). HARDCODED — nobody earns it against 2 maps and 20 relics. The page shows honest progress: relics per level built, levels built of 10. |

Every key is a **high-water mark** (`pandora_keys` rows are never deleted by
the rules; only the admin lever can). The admin reads Tier 4 at the door
but is never issued a key: THE HOUSE DOESN'T COMPETE (same as badges).

Grants run through ONE function, `checkPandora(userId)` in
`src/achievements.ts`, called from the same places the badges are checked
(the debounced store poke, login, profile views) — retroactive by
construction. Each grant emits `pandora.key` → realtime tells the earner,
Sterling DMs them ("it's waiting for you at the box").

## The box (`PandoraBox.svelte`, rail view `pandora`)

- The box, drawn (SVG + CSS): an ornate chest with three keyholes across
  its face, on a dais. Three empty squares below it. A key you've earned
  sits in its square; drag it (pointer events, touch included) to its
  keyhole and it snaps. `POST /api/pandora/insert {key}` persists it
  (`insertedAt`). Keys can go in one at a time, long before the third.
- Three in → the box GLOWS (the aura), the lid rattles, and it takes a
  click. `POST /api/pandora/open {choice}`: requires all three inserted,
  once per opener, the choice available. Records the opening, stamps the
  world effect (`app_kv pandora:<choice>`), issues the suit, emits
  `pandora.opened` → Sterling's grand announcement in #general (forced past
  his cooldown), and the `pandora.opened` broadcast every client plays as
  bells. (There is no separate `pandora.fanfare` frame — the VIP herald has
  one of those, this does not.)
- The choice screen shows the world choices with their availability; a
  taken one is engraved with the name that took it. When every world
  choice is gone an opener chooses nothing — the record says they
  **left hope in the box** (the myth's ending) and they still get the suit.
- **The ledger**: every opening, in order — who, when, what they chose.
  Visible to everyone; it's the point of the page for the other 99%.
- Phones: the view is allowed (drag is pointer-based); the box scales. Both
  `pandora` and `portal` are in `PHONE_VIEWS` — they were missing from it
  until the Sep 2026 review round, which made this line a lie and bounced a
  phone straight back to chat at the moment the endgame paid off.

## THE PANDORAN — the suit every opener receives

Not a choice; issued at the open (`suit-pandoran`, an award-only Emporium
item like the badge rewards — never stocked, never buyable, unsellable to
Voss; the locker row follows through `ensureVipSuits`'s path, colorway
`pandoran`). Its look, on the shared canvas texture every colorway uses so
the whole hall sees it:

- An obsidian body that reads as DEPTH: a drifting star field painted into
  the suit pixels (`voidWash` — the goblins' sky, inverted), with a faint
  nebula.
- Gold GREEK MEANDER trim along the seams instead of plain hardware; three
  engraved keyholes on the chest plate.
- Light leaking from the seams — the only emissive any suit carries.
- Sterling greets a Pandoran by name at his counters (a `pandoran` line in the
  CLIENT's `sterling-lines.ts`, read off the owned Emporium item). NOT YET
  BUILT: the server-side `/sterling` greeting has no Pandoran branch —
  `greetingFor` in src/sterling.ts pushes night/regular/shielded/tier1..4 and
  nothing else.

## The world choices (once-ever, server-wide)

Each is a regime flag in `app_kv` read by the code that already exists.
**Both regime effects are wired (2026-10-31)** — `test_pandora_regimes.mjs`
proves them. Two small calls made in the build: the repo shelf stays at the
kiosk with its silver going into the same vault (now Foundry Lending's
capital), and a Foundry loan's rate still steps a point a missed day but
never past 12%.

1. **Destroy the Goblins.** Goblin Lenders is gone. The lender
   engine stays, flipped to **Foundry Lending**: rates 3 / 4 / 5 / 6% a day
   (were 15 / 20 / 25 / 30), the ladder ends at REPOSSESSION (no cells), no
   letters, no barker, the ATM and the kiosk re-dressed in Foundry brass,
   Sterling openly pleased. **Every open debt is WASHED** (Josh) —
   forgiven, rows gone, prisoners released with their pots refunded, the
   repo shelf handed to Sterling. The vault stays the same table (the
   conservation sum is unchanged). The six goblin badges retire
   (`retired: true`) so the Brass Key stays earnable.
2. **Retire the Reaper.** The death wedge is blunted for good: the reaper
   blinks every time (`reaperRate` read as 0 under the flag), the
   wedge stays on the wheel as a memorial. The Graveyard, the Wake and the
   Inheritance stay as history. The talisman becomes a pure collectible:
   Sterling's shield counter and the Wheelwright's mythic-for-talisman
   trade close. The goblins' cell still seals through the grave path.
3. **Take the Stone.** Not a regime — a thing. THE STONE OF THE ABYSS
   (`src/abyss.ts`): a dark stone cut from what looks like the inside of
   a black hole, a violet glow at its heart, and nobody is told what it
   does. **Repeatable** (`once: false`): every opener may reach for it, so
   the third choice never runs out and never engraves a name — the card
   counts how many have reached for it instead. Handed over inside the
   opening's transaction (`addEmoji`), no world flag. (Josh, 2026-09-17,
   after two earlier thirds: the eighth spin, a faucet widening, and Open
   the Foundry Vault, half-price counters — "make the third choice the
   stone".)

More choices can join later; the ledger and the choice screen are catalog-
driven (`PANDORA_CHOICES` in `src/pandora.ts`).

## THE STONE OF THE ABYSS — what the third choice leads to

The stone sits in the emoji inventory under its own tier, `abyss`, first
in the collection, breathing violet. It is BOUND: Sterling won't buy it,
the goblins can't seize it, the Forge won't melt it, no trade, auction or
stake carries it, a self-revival never burns it, and it is the rarest
thing a grave can hold so the next generation always carries it out.

Click it (your own profile) and the stone speaks — a phrase in a tongue
nobody here has heard, pressed into the back of your mind: *"Vhaal'ith
sorrun ke-tahl. Oveth naa'ir."* Say it back (`POST /api/abyss/speak`)
and THE PORTAL opens: a new rail section under THE HUB, yours from then on
(`abyss_portal`, migration 97). Today the Portal is the threshold — the
ring of light, the phrase, and the way back. The far side is the next
design round: an abandoned Solace once used by an alien research
community, its channels and voice rooms written in their language, a chat
history to read, offline users, games, and decipher modules that unlock
the language a letter at a time. The lore and the layout are Josh's
discussion to have before any of it is built.

## Admin

`POST /api/admin/pandora/key {userId, key}` hands a key to a member for
testing (audited; refuses admins/bots) and `{revoke: true}` takes it back;
`POST /api/admin/pandora/reset {userId}` clears a test opening. The world
flags have no admin lever — an opening is the only way to set one.

## Harness

`node scripts/checks/test_pandora.mjs` over a real server: the pure rules
(retired badges excluded, the Rusted constants, a key never revoked by the
rules), the three grant hooks (Tier 4 staged → the Prismatic Key with the
earner's frame and Sterling's DM; every earnable badge granted → the Brass
Key; 20 relics → NO Rusted Key, the admin lever grants it), insert guards
(unearned refused, idempotent), open guards (two keys refused, admin
refused, once per opener, a taken world choice refused), the suit issued
(item + locker row, unsellable to Voss), the announcement + fanfare over
the wire, the ledger, hope-left-in-the-box when the choices are gone, and
the admin lever refused to members and audited.
