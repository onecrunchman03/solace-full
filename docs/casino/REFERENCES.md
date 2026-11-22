# THE FLOOR — CLASSIC VEGAS REFERENCE SET AND DESIGN BRIEF

Josh picked the look for the casino floor's redesign (2026-10-13): **"A —
Classic Vegas"** — red and gold, crystal chandeliers, loud jewel-toned carpet,
neon over every district, a chasing-bulb marquee at the door, dark ceilings so
the floor glitters, warm pools over the tables, gold rails and columns, glossy
marble aisles. Caesars, the old Flamingo, the Golden Nugget, the Bellagio's
floor, Fremont Street bulbs. This file is the reference set for that look and
the brief distilled from it, the same way `docs/backrooms/REFERENCES.md` is for
the Backrooms levels.

**How the set was made.** Josh's 9 saved images (`assets/casino/reference/`)
were viewed one by one. 23 more were found on Wikimedia Commons by searching
casino interiors, slot banks, chandeliers, carpets, sportsbooks, poker rooms,
bars and Fremont Street; about 40 candidates were viewed on numbered contact
sheets and the ones kept are real photographs only (no renders, no AI images).
Many come from Carol M. Highsmith's Library of Congress collection, which is
public domain. Links only: nothing new is kept in the repo.

**How it was measured.** Every image was shrunk to 64×64 and averaged with
`sharp`: the average colour, its luminance (Rec. 601, 0–255), the 10th and 90th
luminance percentiles (how dark the shadows go, how bright the highlights get),
and the luminance of the top quarter and bottom quarter of the frame (in a wide
floor shot that is roughly "ceiling" vs "carpet"). The palette below comes from
the 25 real photos only: saturated pixels bucketed by hue, the darkest and
brightest bands of the whole set, and k-means clusters on cropped carpets,
felts, ceilings and signs.

**A warning about Josh's set.** Seven of Josh's nine are AI-generated (one says
so in its filename; the rest have garbled lettering on their signs and
machines). They are kept as MOOD — they are where "red and gold, chandeliers,
velvet" comes from — but they were not used for numbers. Measured, they are a
lot darker and redder than real casinos: luminance 56 against the real photos'
74, and noticeably more red. **A real classic Vegas floor is brighter and more
gold than the mood pictures.**

## Josh's references (`assets/casino/reference/`)

| # | What it shows | Real? | Avg colour | Lum (p10–p90) |
|---|---|---|---|---|
| J1 | `0e00e399-….webp` — a 1960s Vegas lounge: chandeliers and amber pendant lamps, walnut panelling and framed photos, "SLOTS" bulb sign, roulette, a bar with a brass rail and "COCKTAILS" neon, red patterned rug | AI (garbled "GOLDEN NUGGET" on the slots) | #4f3522 (79, 53, 34) | 59 (13–119) |
| J2 | `9ec821ad….jpg` — a modern restaurant bar: globe pendants, plants, lit back-bar shelves, stools | Unclear (tiny, may be a render); not Vegas | #45301c (69, 48, 28) | 52 (7–112) |
| J3 | `Boyd-scaled.webp` — **Sam's Town, Las Vegas** (Boyd Gaming): a giant stained-glass dome over the floor, slot rows with stools, loud gold/red scroll carpet, neon slot toppers, chaser-bulb sign bands on the far wall, a roulette table and its result tower | **Real** | #716447 (113, 100, 71) | 100 (34–173) |
| J4 | `carl-raw-…-unsplash.jpg` — a row of UK fruit machines: chrome arched tops, red cabinets, red LED meters, dark papered wall with framed pictures (Unsplash, Carl Raw) | **Real** | #4c2931 (76, 41, 49) | 53 (17–103) |
| J5 | `casino-night-ambiance-stockcake.jpg` — huge hanging crystal chandeliers over slot rows and a green table | AI (Stockcake) | #41362c (65, 54, 44) | 56 (22–114) |
| J6 | `classic-casino-interior-rows…357966197.webp` — a vaulted arcade outlined in bulbs, glossy red-reflecting floor, slot rows on the right | AI (garbled machine text) | #673123 (103, 49, 35) | 63 (19–115) |
| J7 | `glamorous-classy-red-casino-room…webp` — red walls, crystal chandeliers, red velvet chairs round red roulette tables, patterned rug | AI | #5f3227 (95, 50, 39) | 62 (7–165) |
| J8 | `luxury-casino-interior…ai-generated…jpg` — a tiered gold chandelier, painted gold columns, red velvet drapes, red tufted chairs, red carpet, slot rows | AI (says so) | #482b20 (72, 43, 32) | 51 (6–116) |
| J9 | `vintage-casino-slot-machines…430604371.webp` — a row of slots with big wheel-of-fortune toppers, red stools | AI (garbled numbers) | #452e24 (69, 46, 36) | 52 (9–123) |

## The real photographs (Wikimedia Commons)

| # | What it shows | Source | Avg colour | Lum (p10–p90) · top / bottom |
|---|---|---|---|---|
| R1 | **Wide floor**, Tropicana: a leaded-glass barrel-vault ceiling the length of the floor, slot rows either side, red patterned carpet runner | [commons](https://commons.wikimedia.org/wiki/File:Casino_and_leaded-glass_ceiling_at_the_Tropicana_Hotel,_Las_Vegas,_Nevada_LCCN2011634482.tif) (Highsmith/LOC) | #655448 | 87 (16–142) · 76 / 39 |
| R2 | **Signage**, Tropicana: a "Jackpot" neon arch spanning the aisle under the glass vault, "Win" neon either side, bulb rows under the arch | [commons](https://commons.wikimedia.org/wiki/File:Casino_interior,_Las_Vegas,_Nevada_LCCN2011636108.tif) (Highsmith/LOC) | #6a5031 | 84 (35–134) · 69 / 97 |
| R3 | **Wide floor**, Monte Carlo: deep coffered ceiling with gilded coves and cove lighting, chandeliers in the coves, tables and slots, gold-capital columns | [commons](https://commons.wikimedia.org/wiki/File:Monte_Carlo_Gaming_Floor,_Las_Vegas.jpg) | #5c432b | 72 (20–142) · 70 / 45 |
| R4 | **Slot carousel + carpet**, MGM Grand: a round carousel of machines under one tall shared topper, rows behind, loud red-and-gold medallion carpet | [commons](https://commons.wikimedia.org/wiki/File:MGM_Grand_hotel_(Las_Vegas)_Casino1.JPG) | #77422d | 79 (27–144) · 96 / 47 |
| R5 | **Old-school floor**, Bill's Gamblin' Hall (the old Barbary Coast): crystal chandeliers over the slot rows, a turned-baluster gold rail, green/red/gold patterned carpet | [commons](https://commons.wikimedia.org/wiki/File:Bill%27s_casino_floor_in_Las_Vegas_(2009).jpg) | #524b35 | 75 (21–138) · 86 / 58 |
| R6 | **Table pit**, Bill's: blackjack tables in a line under a row of big crystal chandeliers, wood-panelled walls with sconces, red chairs | [commons](https://commons.wikimedia.org/wiki/File:Bill%27s_casino_floor_in_Las_Vegas_(2012).jpg) | #5b402d | 70 (13–164) · 92 / 39 |
| R7 | **Table pit**, old Sahara: roulette and blackjack under a run of chandeliers inside Moorish arches, a low glass-and-brass rail, red and gold chairs, patterned carpet | [commons](https://commons.wikimedia.org/wiki/File:Sahara_Hotel_and_Casino.jpg) | #4a3638 | 60 (15–121) · 58 / 40 |
| R8 | **Party pit**, Fremont Casino (Fremont Street): blackjack tables with tall red-backed chairs, slot toppers glowing behind, low panelled soffit | [commons](https://commons.wikimedia.org/wiki/File:Fremont_Street_(Las_Vegas)_Sam_Boyd%27s_Fremont_Casino.JPG) | #5b4f4a | 82 (27–158) · 115 / 65 |
| R9 | **Slot topper**, a bank of four machines under ONE arched "ON THE MONEY!" sign: blue panel, gold scroll border, a ring of chaser bulbs, "25¢" roundels, a progressive meter in the middle | [commons](https://commons.wikimedia.org/wiki/File:Casino_interior,_Las_Vegas,_Nevada_LCCN2011636120.tif) (Highsmith/LOC) | #1f2026 | 32 (0–101) · 28 / 17 |
| R10 | **Slot topper**, "French Kiss — Quarters": a neon sign in pink lips, gold script and blue outline over a bank | [commons](https://commons.wikimedia.org/wiki/File:Casino_(7977514720).jpg) | #4e393b | 64 (8–148) · 69 / 35 |
| R11 | **Carpet close-up**, Atlantis (Reno): big overlapping patches of jungle leaf, chevron stripes and swirls in jewel tones — no visible repeat | [commons](https://commons.wikimedia.org/wiki/File:Atlantis_Casino_Resort_Spa_-_July_2021_-_Sarah_Stierch_2.jpg) | #766a60 | 109 (39–167) · 117 / 77 |
| R12 | **Ceiling + chandelier**, Sahara entrance: a long crystal chandelier, a vault studded with pin lights, stained-glass lunettes, carved arches | [commons](https://commons.wikimedia.org/wiki/File:Chandelier_above_Sahara_casino_entrance.jpg) | #786b49 | 107 (61–169) · 110 / 91 |
| R13 | **Chandelier**, Bellagio: a huge crystal bowl with swan-neck arms and frosted shades | [commons](https://commons.wikimedia.org/wiki/File:Chandelier_at_Bellagio.jpg) | #584c43 | 78 (13–146) · 76 / 48 |
| R14 | **Ceiling dome**, Peppermill (Reno): a shallow round dome with a rib pattern, its cove washed orange and violet, a black-iron chandelier in the middle | [commons](https://commons.wikimedia.org/wiki/File:Peppermill_Casino_-_Kenneth_Lund_-_July_2018_05.jpg) | #8b5750 | 102 (65–142) · 83 / 123 |
| R15 | **Bulb sign**, "CASINO" in big marquee letters, each letter outlined in bulbs, over a stepped red field | [commons](https://commons.wikimedia.org/wiki/File:Neon_casino_sign,_Las_Vegas,_Nevada_LCCN2011636116.tif) (Highsmith/LOC) | #6d0e0d | 42 (17–65) · 40 / 32 |
| R16 | **Entrance marquee**, Golden Nugget on Fremont Street: a scalloped gold arch carrying the name in bulb letters, a canopy of bulbs underneath, smaller bulb arches either side | [commons](https://commons.wikimedia.org/wiki/File:Golden_Nugget_Las_Vegas_entrance_sign.jpg) | #734a3d | 85 (26–134) · 75 / 94 |
| R17 | **Bulb facade**, Binion's Horseshoe (1986): a wall of gold bulbs, neon "HORSESHOE" running vertically, "GAMBLING" in neon on the band | [commons](https://commons.wikimedia.org/wiki/File:Binions_horseshoe_1986.jpg) | #513a26 | 63 (0–143) · 25 / 77 |
| R18 | **Doorway**, Eldorado (Reno): a cream stone arch with carved swags and a gilded keystone, "Slots" in gold script on etched glass | [commons](https://commons.wikimedia.org/wiki/File:Eldorado_Resort_Casino_-_2021-10-17_-_Sarah_Stierch_01.jpg) | #846944 | 109 (38–163) · 137 / 90 |
| R19 | **Race & sports book**, MGM Grand: a whole wall of odds boards (amber LED on black) and screens over rows of lounge chairs | [commons](https://commons.wikimedia.org/wiki/File:MGM_Grand_Race_and_Sports_book_Las_Vegas.jpg) | #68504a | 86 (29–174) · 76 / 39 |
| R20 | **Race & sports book**, Las Vegas Hilton: tote boards in red/amber/green LED, race screens, a long counter of carrels with screens | [commons](https://commons.wikimedia.org/wiki/File:Sportsbook_at_Hilton_-_270062238.jpg) | #3a362c | 54 (7–133) · 34 / 35 |
| R21 | **Poker room**, MGM Grand: a field of poker tables seen from above, a striped carpet, the room set apart by a low rail | [commons](https://commons.wikimedia.org/wiki/File:Mgm-poker-lions.jpg) | #4b443f | 70 (11–156) · 49 / 85 |
| R22 | **Casino bar**, Peppermill Fireside Lounge: a sunken fire pit inside a ring of red velvet booths, brass rails, magenta and blue neon cove lighting | [commons](https://commons.wikimedia.org/wiki/File:The_Fireside_Lounge_-_Las_Vegas.NV.jpg) | #351426 | 32 (6–78) · 44 / 25 |
| R23 | **Casino bar**, Main Street Station: a back-bar of brass, stained glass and carved wood, a bronze boar, bottles lit from below | [commons](https://commons.wikimedia.org/wiki/File:Main_Street_Station_Casino_Brewery_Hotel_bar.-_The_Boar.jpg) | #513a1b | 61 (19–118) · 57 / 46 |

## What the set measures

- **Whole real set (25 photos):** average colour **#5d4438** (93, 68, 56),
  luminance **74** (range 32–109; average shadow p10 = 22, highlight p90 = 137).
- **Josh's AI mood images (7):** #4f3123 (79, 49, 35), luminance **56**.
- **The eight wide floor shots** (J3, R1, R3–R8): luminance **78**; the top
  quarter of the frame averages **89**, the bottom quarter **52**. **The upper
  third of the view is the brightest part of a Vegas floor and the carpet is the
  darkest** — not because the ceiling is pale (its plane is dark), but because
  that is where the chandeliers, glass, coves and toppers are.
- **Hue share of all saturated pixels in the real set:** warm reds, ambers and
  golds (0°–60°) are **32.6%** of every pixel; all the cool "jewel" hues
  together (green through magenta) are **4.5%**. Warm outnumbers jewel about
  **7 to 1**. Amber/gold (30°) alone is 20.3% — the biggest single colour.

## THE PALETTE (measured)

| Role | Hex | Where it came from |
|---|---|---|
| Ceiling field / deepest shadow | **#0f080b** | darkest 20% of the whole real set |
| Dark wood, ceiling coffers | **#3b2617** | Monte Carlo ceiling cluster |
| Midtone (the "average" of the room) | **#59362a** | middle 40–60% luminance band |
| Casino red (carpet, velvet) | **#7a211f** | red hue bucket, all real photos |
| Bright carpet red | **#8d240d** | MGM carpet cluster |
| Wine shadow red | **#2a0e09** / **#60090c** | MGM carpet shadow · CASINO sign field |
| Neon red | **#92120d** → **#b34312** | CASINO bulb sign, field and glow |
| Amber gold (the dominant hue) | **#805326** | 30° bucket, 20.3% of all pixels |
| Carpet gold | **#b36311** | Sam's Town carpet cluster |
| Brass / gilt | **#bd9c59** · **#9a7a43** | Main Street back-bar · Eldorado gilt |
| Glass-dome gold | **#ddba56** | Sam's Town stained-glass dome |
| Chandelier amber halo | **#d0904e** | Bill's chandelier cluster |
| Chandelier crystal / bulb core | **#f0d9b0** → **#f7f9ee** | Bill's chandeliers · top 1% of the set |
| Stone / marble | **#bda47c** | Eldorado stone arch |
| Felt green (lit / shadow) | **#36c062** / **#2e542d** | Sam's Town roulette felt |
| Jewel blue (toppers) | **#0a2b9c** · **#262f91** | "On the Money" topper · blue bucket |
| Jewel cobalt | **#3469a4** | 210° bucket |
| Jewel teal | **#287674** | 180° bucket |
| Jewel magenta / rose | **#97259a** · **#8f1c47** | 300° / 330° buckets |

## DESIGN BRIEF

Numbers marked ≈ are read off the photos against people and furniture, not
measured.

### Palette and overall value

1. **Gold leads, red supports, jewels accent.** Keep the warm-to-cool ratio of
   the real set: about 7 parts red/amber/gold to 1 part jewel (blue, teal,
   magenta, green), with gold/amber the single biggest colour. Red is the
   carpet's and the velvet's colour; gold is the trim's, the light's and the
   carpet pattern's.
2. **Target the real floors' value, not the mood pictures'.** Average scene
   luminance ≈ 75 (sRGB 0–255), shadows down to ≈ 20, highlights to ≈ 140–170.
   If a screenshot of our floor averages near 50 it is reading as the AI images
   (too dark, too red), not as a casino.
3. **Light colour is warm WHITE, not orange.** Bulb and crystal cores ≈
   #f0d9b0 to #fff2d8 (≈ 2700–3000 K); the amber halo around them ≈ #d0904e.
   Pure orange (#ffc98a and redder) is for candles and the bar, not the floor.

### Carpet

4. **Loud, jewel-toned, no visible repeat.** Every real floor carpet is a
   busy, high-contrast pattern: scrolls, medallions, florals or jungle leaf on a
   red or gold ground, with three or more tones. Measured contrast inside one
   carpet runs from luminance ≈ 22–40 (shadow) to ≈ 64–113 (the bright motif);
   that is a 2–3× spread, not a faint tone-on-tone.
5. **Motif scale ≈ 0.5–0.9 m** across (a medallion is about a stride), with
   smaller filler between. Big enough to read from standing height, small
   enough that a 2 m aisle shows two or three of them.
6. **Two carpets, not one.** Gaming areas get the loud field; walkways get a
   calmer runner in the same colours, or a border, so the aisles read as paths
   (R1, R5). The pit and the poker room may have their own carpet (R21's
   stripes) to mark them as rooms.

### Ceiling

7. **A dark field studded with light.** The ceiling plane is near black
   (#0f080b–#3b2617), but it is full of light: pin lights (R12), cans, roses,
   coves. In every wide shot the ceiling band is brighter than the carpet
   (≈ 89 vs 52) because of the fixtures in it.
8. **One feature ceiling over the centre.** Every classic floor has a showpiece
   overhead: a stained-glass dome (J3), a leaded-glass barrel vault (R1, R2), a
   ribbed dome with a coloured cove (R14), or gilded coffers with cove lights
   (R3). Put ours over the Wheel's stage. A dome or coffer recessed even 0.5–1 m
   above the main ceiling, lit from a hidden cove, reads as much taller.
9. **Low over the slots, high over the show.** Slot rows sit under a lower,
   darker soffit (≈ 3.5 m in R8); the pit and the centre open up. The change of
   height is itself a way of zoning the room.

### Light

10. **Light pools, it doesn't wash.** The table pit is the brightest thing on
    the floor (p90 ≈ 164 in R6): each table sits in its own pool from a
    chandelier or pendant right above it, with darker carpet between tables.
    Slot rows are lit mostly by the machines themselves.
11. **Chandeliers in rows, not one.** Classic floors hang a RUN of crystal
    chandeliers along the pit and the main aisle (R5, R6, R7, J5), ≈ one per
    table or per 4–6 m of aisle, each 1–2 m across. One big one is the
    showpiece, the rest are the rhythm.
12. **Coves and bulbs carry colour; downlights stay white.** Coloured light
    (violet, magenta, blue) comes from cove strips and neon (R14, R22), never
    from the lamps over the tables — felt and cards must read true.

### Signage

13. **A neon or bulb sign over every district**, mounted high (≈ 3–4 m to the
    bottom of the sign), letters ≈ 0.4–0.6 m tall inside the floor (R2, R10),
    readable from across the room. Each district gets its own colour: SLOTS
    red-and-gold bulbs, BLACKJACK gold script, POKER blue neon, RACE BOOK amber
    LED, BAR magenta/pink neon (R22's "COCKTAILS" register).
14. **Bulb letters, not flat panels.** Big words are outlined or filled with
    bulbs (R15, R16, R17) on a red or gold field; smaller words are neon tube
    script with a contrasting outline (R10's pink lips and blue rim). Bulbs
    chase: a slow travelling pattern along a border, ≈ 1 bulb step per 60–120 ms.
15. **The entrance is a marquee.** A scalloped gold arch over the doorway, the
    name in bulb letters ≈ 1–1.5 m tall, a canopy of bulbs underneath and
    smaller bulb arches either side (R16). It is the first thing you see and the
    most lights in one place.

### Slots

16. **Banks, not lines.** Machines stand in back-to-back rows of 6–12 (R1, R5,
    J3) and in round carousels of 6–8 (R4), with stools at every machine and an
    aisle ≈ 2 m wide between rows.
17. **One shared topper per bank.** A group of 3–6 machines carries one big
    arched sign above it (R9: four machines, one "ON THE MONEY!" arch with a
    chaser-bulb ring, "25¢" roundels and a progressive meter), ≈ 1–1.5 m tall,
    its top ≈ 2.8–3.2 m off the floor. Toppers are where the jewel colours live
    (blue, magenta, teal) against the room's gold.
18. **A progressive meter is the bank's heartbeat.** A red or amber LED number
    over the bank that visibly ticks up (R9).

### Tables

19. **A pit, not a scatter.** Blackjack and roulette tables stand in a line or
    an oval facing one another round a central pit (R6, R7), each under its own
    light, with a low rail (≈ 0.9 m, brass or glass-and-brass) round the outside
    that spectators lean on.
20. **The poker room is a room within the room.** A field of oval tables set
    apart by a rail and its own carpet (R21), quieter and evenly lit.
21. **The race book is a wall of boards.** A whole wall of black odds boards in
    amber/red/green LED with screens set into it (R19, R20), rows of lounge
    chairs facing it, a counter along one side.

### Materials

22. **Gold on everything that edges something**: rails, column capitals and
    bases, table rails, sign borders, chandelier frames, trim lines. Brass
    #9a7a43–#bd9c59, lit gilt #ddba56.
23. **Marble and stone at the edges and the aisles**: cream stone arches and
    columns (#bda47c, R18); glossy marble for the main walkways so the lights
    reflect in them (the reflection is half of J6's appeal). Carpet stays in the
    gaming areas.
24. **Velvet and lacquer at the seats**: red velvet or leather on chairs, stools
    and booths (#7a211f); dark lacquered wood on cabinets, bars and walls.

### Signature moments (what makes a classic floor enticing)

1. **The marquee arch at the door** — you walk in under a canopy of chasing
   bulbs and the name in lights.
2. **The look up** — the stained-glass or gilded dome over the centre,
   glowing, the one thing you see from everywhere.
3. **A line of chandeliers down the pit**, each throwing a pool of warm light
   onto green felt.
4. **A bank of slots under one big arched topper**, its bulb ring chasing and
   its progressive meter ticking.
5. **A "JACKPOT" neon arch spanning an aisle** (R2) — a gate you walk through.
6. **The bar as a jewel box** — a lit back-bar of bottles, brass and stained
   glass, and a neon "COCKTAILS" in pink.
7. **The race book's wall of boards** glowing amber in a darker corner.
8. **Gloss underfoot** — marble walkways that double every light.
9. **The carpet** — loud enough to be part of the show, never a blank.
10. **Colour on the move** — slow chasing bulbs and breathing neon, so the room
    is never completely still.

## WHAT OUR HALL IS MISSING

Compared from `client/src/casino/layout.ts`, `world.ts` and CASINO.md (not
from screenshots — a measured fly-through of our hall, as was done for the
Backrooms, is the next step before building).

Today the hall is a PSX low-poly room, 62 × 26 m with a flat 5 m ceiling:
walnut wainscot to 1.2 m, dark red damask above, a dark coffered ceiling, a
wine-red carpet, eight plain walnut box columns, one brass trim line at 1.22 m,
one candle chandelier over the stage, about 25 pendant lamps, and a handful of
spots, all warm orange.

- **The carpet is too quiet and too dark.** Base #3d1119 (luminance ≈ 31) with a
  rosette at #5c1b26 (≈ 48): a 1.5× spread where the real carpets run 2–3×, and
  no gold field at all. Its one gold accent is a 3.5 px dot. The motif tile is
  2 m; the references' medallions are ≈ 0.5–0.9 m. (Rules 4–5.)
- **One carpet everywhere.** No marble walkways, no calmer runner (the slots
  runner is the same carpet warmed), no pit or poker carpet. (Rules 6, 23.)
- **No feature ceiling.** The ceiling is one flat coffer texture at 5 m; there
  is no dome, vault, cove or pin-light field, and nothing above the Wheel but its
  chandelier. (Rules 7–8.)
- **No change of ceiling height** between slots, pit and stage. (Rule 9.)
- **One chandelier.** The pit has pendants, not a run of crystal chandeliers.
  (Rule 11.)
- **The light is orange.** Points are #ffc98a and the hall's ambient is a warm
  brown; the references' cores are warm white (#f0d9b0–#fff2d8). (Rule 3.)
- **Almost no district signage.** Josh removed the floor placards; what is left
  is four blackjack wall plaques, a CASINO and a VIP neon prop, the
  ESCAPE ROOM sign and the Concession plaque. No district has a neon or bulb
  sign over it. (Rules 13–14.)
- **No entrance marquee.** The door is a closed pair of doors in the damask
  wall. (Rule 15.)
- **Slots are two straight rows of 9 against the west wall**, each cabinet
  carrying its own small marquee. No carousels, no shared toppers, no
  progressive meter over a bank. (Rules 16–18.)
- **Gold is thin.** One trim line and the rope stanchions. Columns are walnut
  boxes with no capitals or bases; there are no gold rails round the tables
  (the bar has a brass foot rail). (Rule 22.)
- **No stone or marble anywhere**, and no glossy surface for lights to reflect
  in. (Rule 23.)
- **No race book wall.** The Derby lives on a jumbotron over the bar and a
  ticket kiosk; there are no odds boards or lounge chairs facing them. (Rule 21.)
- **No coloured cove or neon light in the room's structure** — colour comes only
  from two small neon glows and the slot screens. (Rule 12.)
- **What we already have that the brief keeps:** the warm pools over each
  table (the spots and pendants), the dark ceiling field, red velvet on the
  stage skirt and ropes, the lit back-bar, the bloom pass (a glow that the
  bulbs and neon will need), and one-lamp-per-table placement.
