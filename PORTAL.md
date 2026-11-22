# THE PORTAL — Naa'shenai, the far made near (lore REWRITTEN 2026-09-26; build REOPENED 2026-10-30)

**Status: the door is shipped, the world behind it is not.** The Stone of the
Abyss, its phrase, and THE PORTAL rail section are live (migration 97,
`src/abyss.ts`, harness `test_abyss.mjs`); the Portal view is a THRESHOLD ONLY
— the ring, the phrase, "Solace is behind you." Everything below is the agreed
lore for what lies past it. **Josh parked the build 2026-09-17** ("when i finish
building solace we will come back to it") and **reopened it 2026-10-30** —
see Validation near the end. Only the archive checker is code so far.

**2026-09-26: Josh replaced the story.** The 09-17/09-25 version (the Sorren,
the listening argument, anchors that "complete", a survivor, a Keeper who moves
into Solace) is RETIRED — it lives in git history (`9951ddd`) and nothing in it
binds this version except the shipped phrase. The new story is **cosmic
horror**: an ancient civilisation, a hunger from outside the universe, and a
chat log of the end of the world, read millions of years too late.

---

## Josh's brief

The 2026-09-17 scope, which still stands:

- A mystery stone in its own emoji tier, clickable; it glows and calls you to
  say an alien phrase; saying it opens **the Portal**.
- The Portal leads to **a brand new Solace**, abandoned and old, once used by
  aliens — text and voice channels written in alien, **the whole UI alien**.
  Players can go back to Solace and return.
- Its channels hold **a rich history**, its roster carries **offline users**.
- A **research** civilisation. Players uncover **what happened and who they
  were**. There are **games** there.
- An **alien language**, deciphered **one letter at a time** by **decipher
  modules**.

And the 2026-09-26 rewrite, verbatim in substance:

- **Darker. Cosmic horror.** The alien name is their word for *Solace*.
- Players find **an empty version of themselves** among the ancient history of
  ghosts (the alien users).
- **Many channels a newcomer cannot post in**, because the platform only
  accepts posts written in the aliens' language.
- **Timestamps are in an alien time format** players must also work out.
- The platform was active **millions of years ago**. It still runs only because
  its computer is **powered by a star in a galaxy billions of light-years from
  the Milky Way**.
- The users were **one race, spread across multiple galaxies of one cluster**.
  A cosmic calamity happened in their time.
- **The arc of the log:** it reads normally for a while — news from their
  worlds, scientific achievements. Then **rumours** of an intergalactic dark
  force consuming all life in one galaxy of the cluster. Some **dismiss it** —
  "the military will handle it." Over time **users disconnect and are never
  heard from again**. Panic. Talk of the force and what it does, more and more
  frightened. **Hopelessness.** Then suddenly **every user on the platform goes
  dark.**
- **The dark force** came into our universe through a **wormhole from a universe
  of chaos and disorder**. It consumes all bio-organic life and grows — bigger,
  stronger, spanning galaxies. **No morality, no purpose, no speech, no
  agency** — only hunger. It **corrupts life into itself**: a brutal death in
  which your whole life, your memories, every trace of your existence is erased
  and your atoms are reorganised into energy for it.
- The platform survived because it sat in **a secret stellar system in an
  uninhabited galaxy with very little life**. It shows **wear**.
- **The custodian** is its record keeper, data organiser, maintainer and
  repairer. It **glitches, rarely**. It **never speaks English**, and it **will
  never leave**.
- The aliens had **no bars, no gambling** — far past human vices. They lived for
  **exploration and understanding the fabric of existence**; science and research
  of every kind.
- **Humanoid, grey skin, large eyes, about five feet tall.**
- **Nobody knows what happened to the force**, where it is, or whether it is
  still in our universe. **The archive holds nothing after the last pleas for
  help.**
- New names for all of it. **Josh likes glyphs.**

## The names

Every name is written in the glyph script and means something once cracked —
so for most of the game the cast, the places and the enemy are just shapes.

| Name | Reading | What |
|---|---|---|
| **Naa'shenai** | *naa* (far) + *shenai* (together): "the far, together" | **Their Solace.** A hall for people who lived galaxies apart. |
| **the Eshai** | *esh* (to see) + *-ai* (people): "the ones who look" | **The race.** Named for their eyes and what they did with them. |
| **Ilumaar** | *ilu* (lit) + *maar* (many): "the lit many" | **The cluster**: six inhabited galaxies, one people. |
| **Nul'ir** | *nul* (empty) + *-ir* (shore): "the empty shore" | **The uninhabited dwarf galaxy** where the hall was hidden. |
| **Ormaa** | "the steady one" | **The star** that powers the hall, and still does. |
| **Makaal** | *ma-* (not) + *kaal* (make): "the unmaking" | **The dark force.** A clinical name, coined late, by scientists. |
| **Khaa'vhaal** | *khaa* (the dark) + *vhaal* (door): "the dark door" | **The wormhole** it came through. |
| **Tharvend** | *thar* (to keep) + *vend* (the count): "the keeper of the count" | **The custodian.** |
| **onnith** | *onn* (to hold fast) + *-ith* (deep) | **A keystone** — the stone in your inventory. |

The six galaxies, in **the order they went dark**: **Theruun** (where the door
opened) · **Oshkaa** · **Paaruk** · **Senwe** · **Yulenai** · **Maalith** (the
oldest, the home galaxy, the last).

## The frame: why the hall looks like ours

**Solace is a copy of Naa'shenai.** The Foundry found a keystone. They could
read almost nothing on it, but they could read its SHAPE — rooms where voices
gather, a roster, a record that keeps — and they built that shape in iron and
silver. They never learned what it was for. They locked the stone in a box
behind three locks and went upstairs.

So when a player walks through the Portal, **they walk into their own house,
emptied.** The rail, the channel list, the roster, the unread pips — the layout
they use every day, rendered in glyphs and cold light, full of dead people. That
is the "empty version of yourself" before a word is read.

**How a keystone reached us.** Every Eshai connected to Naa'shenai through a
keystone. In the last weeks, with the cluster falling, somebody gathered the
unassigned keystones — the seats for users who would never be born — and cast
them outward through a fold, blind, in every direction, with one instruction
burned into them: *find anyone*. **The stones are a plea for help.** One casket
of them arrived here, after a length of time nobody should think about. That is
what was in Pandora's Box, and why the box can hand out more than one.

**What the phrase is.** The shipped `ABYSS_PHRASE` is a keystone's handshake,
and its meaning is unchanged:

> *Vhaal'ith sorrun ke-tahl. Oveth naa'ir.*
> "The door beneath listens still. I answer from the far shore."

The hall has been listening for a login for millions of years. Nobody ever
answered. **A player who speaks it is the first user to connect since the end.**

The cold detail players find much later: *vhaal*, "door," is the same root as
*Khaa'vhaal*, the dark door. The Eshai's own physics is fold physics, and so is
the wormhole. The phrase does not mean the force. The language just never
bothered to tell the two doors apart.

## Your empty self

**When a player first comes through, Tharvend files them.** A new row appears on
the Naa'shenai roster: **your name, transliterated into glyphs by sound** —
Tharvend's best attempt at a language it has never heard. It is an empty
account among the ghosts, offline in a hall of the dead, the first row added in
millions of years.

It is also the **first crib**. You know the sounds of your own name, so the
glyphs in it are yours to test from minute one — and every other player's row
gives up a few more.

## The hall

Shaped like a Solace page so it reuses pages, channels, roles, voice, roster and
unread. The room names are words, so the channel list is itself a reading
exercise.

| Room | Reading | What it is |
|---|---|---|
| **shenai** | "together" | The general room. Everyone, every galaxy, every mood. The arc is clearest here. |
| **naa-ren** | "the far hearing" | **The digest.** One curator posts news from all six galaxies, one heading per galaxy. As the galaxies fall, **the headings stop appearing**, and the digest gets shorter. |
| **kaal-ith** | "the deep works" | Research: fold physics, surveys, discoveries. Under a **second cipher** (a professional notation, the way a physicist's shorthand isn't their language). Later, it is where somebody measures what Makaal does to matter. |
| **Theruun · Oshkaa · Paaruk · Senwe · Yulenai · Maalith** | the galaxies' own names | **One room per galaxy**, local talk from home. **They fall silent in the order the galaxies fell**, so the channel list's last-activity column maps the force's path across the cluster before anyone can read a word. |
| **tharvend** | "keeper of the count" | Tharvend's maintenance log. Read-only. **The only room with recent timestamps** — it has been filing repairs for millions of years. |
| *(one glyph, nowhere else)* | — | **The last room.** The final pleas. Its name's glyph appears exactly once in the archive, so it cannot be cracked by frequency; it comes from the last decipher module. It arrives as a gift, not a solve. |

Plus **two voice rooms**, live for us. See the custodian's glitches.

**The atmosphere:** the place starts dim and gets brighter as you learn to read
it. Cold greys, bruise violet and pale cyan against Solace's warm ember. No
lamp this time: the only light is the glyphs you have made readable.

### Reactions: six signs

Naa'shenai had reactions, like Solace, but not emoji: **six signs**, drawn
in the glyph style, each one a word of the language.

| Sign | Word | Used for |
|---|---|---|
| ren | "heard" | acknowledgement, the commonest |
| ta'an | "company" | warmth, affection |
| ahel | "laugh" | something funny |
| eeth | "true" | agreement |
| sehu | "sorry" | grief, sympathy |
| onn | "hold fast" | solidarity; also how the Eshai say goodbye |

The archive's reactions are drafted (`↳` lines in the room files). They
thin as the rooms do, and **nobody reacts to the last pleas**.

**Players may react from their first minute.** The six signs are the one
thing in the hall a newcomer can "say" before they can read, and they are
filed like everything else. It is the first way a player joins the room,
and the most likely first thing they do is press *onn* on something they
cannot read yet.

### Posting: you speak their language or you do not speak

**Every room refuses a post that is not written in the Eshai script.** The
composer carries a glyph keyboard; ordinary letters are rejected with a status
glyph, and Tharvend does not explain itself. A newcomer can read nothing and say
nothing.

**Proposal (open decision 3): every word must be a word Tharvend knows** — in
the lexicon the community has confirmed. **You can only say what you have
learned to read.** Deciphering stops being only a reading progression and
becomes the right to speak. It also makes the Portal close to impossible to
abuse, because the vocabulary on offer is a dead research civilisation's.

Players' posts become part of the archive: a few dozen living voices in glyphs,
at the bottom of rooms that stopped millions of years ago.

## Time

The history is timestamped in **Eshai time**, which players must crack like the
script. The clock is the heart of the horror, because once it is read, it
produces one number.

**A people spread across galaxies cannot use a planet's day.** They counted in
the one tick every galaxy shares: **the hydrogen line** — the 21 cm transition
of neutral hydrogen, 1,420,405,751.768 Hz, the same clock humans engraved on the
Pioneer plaque for exactly this reason. **One Eshai tick ≈ 0.704 nanoseconds.**

**They count in base 8** — four fingers on each hand (proposal; open decision
2). The numerals are **eight more glyphs**, separate from the 26 letters.

| Ticks | Roughly |
|---|---|
| 8¹⁴ | 52 minutes |
| 8¹⁵ | 6.9 hours |
| 8¹⁶ | 2.3 days |
| 8²⁰ | 25.7 years |
| 8²⁴ | 105,000 years |
| 8²⁷ | **54 million years** |

A timestamp is a count from their epoch, ~28 octal digits long, drawn in
groups.

**How it cracks — and this is the best puzzle in the Portal:** your own posts
are timestamped too. **You know when you posted.** Post twice, a known interval
apart, and the difference in ticks gives ticks-per-second. A player who
recognises 1.42 billion has found the hydrogen line, and the whole calendar
falls open.

**And then they subtract.** Tharvend's log runs to the present. The last plea
sits at the bottom of the last room. The gap between them is the number the
whole Portal is built to deliver: **roughly 54 million years** (dial — open
decision 2). The roster's "last seen" column resolves at the same moment:
every Eshai account, last seen tens of millions of years ago, all inside the
same few weeks.

**What it all is before it is read:** strings of shapes. The timestamps line up,
bunch together, and then — past a certain point in every room — simply stop.
Players see the silence before they understand what it is.

**The easiest way in is the digest.** *naa-ren*'s digest posts exactly once a
**turn** (8¹⁷ ticks, ~18.35 days), so every digest timestamp ends in seventeen
zeros and only one digit changes between them. A player who notices the column
of identical endings has found the turn before anything else.

## What they believed: the count

The Eshai have no afterlife. They have **the count** (*vend*): the record of
every life, kept whole. A death is announced as somebody being **entered into
the count**, and a life that is kept is not over. The Oshkaa indexers who keep
it are the nearest thing the Eshai have to priests.

**This is why Makaal is the worst thing that could happen to this people in
particular.** It does not only kill; it erases every trace of a life, and the
count needs a trace to keep. From movement 3 on, the dead are not entered into
anything, because there is nothing to enter. The only record of any of them that
survived is the one Tharvend, "keeper of the count," still keeps.

**Why the archive is only four years long.** The hall kept a rolling window of
recent posts; everything older went to **the deep count on Maalith**, and
Maalith is gone. The window opens mid-stream, at digest 13741 (octal), a digest
already about three hundred years old.

## The arc of the log

The archive covers about **four of our years**: one of ordinary life, three of
the end. Five movements, written in this order and read in this order.

### 1. The lit many (~40% of the archive)

A civilisation at its height, and it has to be worth losing. Digest headings
from all six galaxies. A fold array reaching a new distance. A survey that maps
a filament of dark matter. A paper on the structure of the vacuum argued over
for a week. Somebody's child's first observation. Star-maps posted as gifts.
Music that is really a way of describing a pulsar. **No bars, no gambling, no
vice** — their pleasures are wonder, argument and discovery, and the social
room is full of it.

**Theruun's room is the proudest in the hall.** Its researchers run the deepest
fold experiments in the cluster. That is all the archive ever says about it.

### 2. The rumour (~15%)

The Theruun digest heading is short one day. Then late. A Theruun user posts
that her family's messages have stopped. **Everything said about the force in
this movement is secondhand** — the reported evidential, every time, which a
player who knows the grammar will notice.

The dismissals are reasonable, and the reader has to find them reasonable:
long-range comms fail, the Theruun arm is far, **the Ninefold Fleet** has held
the cluster for longer than anyone has records, and it is already moving. The
fleet veteran in *shenai* is warm and certain, and people are grateful for him.

### 3. The disconnections (~15%)

Users go offline and do not come back. Nobody announces it; people notice
absences. *Has anyone heard from…* becomes a phrase. **The Theruun room goes
silent**, then Oshkaa's. A fleet navigator posts from the front — the first
**eyewitness** accounts, the witnessed evidential at last — and then her posts
stop. The veteran stops posting mid-argument and never finishes it.

It gets a name here. The scientists call it **Makaal**, "the unmaking," because
they need a word for the measurements, and the measurements are what the
scientist in *kaal-ith* posts: that nothing comes back, not bodies, not
wreckage, not signal, not heat; that the matter is still there and
reorganised, and it is not matter anymore. **She is the one who works out it
erases everything, and she posts it as a finding.**

### 4. The panic (~15%)

Paaruk, then Senwe. Rooms that used to argue about physics argue about where to
run. Evacuation plans that the arithmetic makes pointless, and somebody posts
the arithmetic. People ask Tharvend for things it cannot do. The digest is two
headings long. Somebody posts the full text of every paper from their
institute, all at once, so it will exist somewhere.

**Nobody ever describes Makaal seeing them, hunting them, speaking or wanting
anything, because it doesn't.** The horror is that there is nothing to plead
with. It is not coming for anyone. It is simply arriving.

### 5. Hopelessness, and the dark (~15%)

Yulenai. The posts get short. People say goodbye to people in other galaxies,
because distance is now the only thing deciding who goes last. The warmest
voice in the hall posts one more star-map, and it is a map of where the lights
used to be.

**Maalith, the home galaxy, the oldest, goes last** — and the last messages
are the **pleas for help**: to the fleet, to other galaxies, to Tharvend, to
anyone, in the witnessed-now evidential that means *I am watching this happen
and it is not finished*. Then the timestamps stop in every room at once. Only
Tharvend's log goes on.

**There is nothing after the pleas.** No record of where Makaal went, whether it
stopped, whether it is still in this universe. The archive ends where its users
did.

### The last room

The final module opens the last room: the final pleas, gathered together,
with the instruction burned into the keystones — *find anyone* — which a
player reads with one of those stones in their own inventory. What the room
actually says is in the archive drafts, and is deliberately not summarised
here.

## The cast

Eight speaking voices, dozens of silent roster rows. Names in glyphs, meaning
revealed as they crack.

- **Oruun Vael** — the **curator of the digest**. Precise, generous, proud of
  six galaxies. Her digests are the spine of the archive, and her arc is just
  the digest getting shorter. She keeps posting it to the end, down to one
  heading.
- **Senneth Ilaar** — **fold physicist, *kaal-ith***. Brilliant, funny in
  footnotes. She is the one who measures Makaal, and she never stops being a
  scientist, which is the most dignified and most frightening thing in the
  archive.
- **Tamruk Hesh** — **the fleet veteran** in *shenai*. Warm, certain, the
  voice of "the Ninefold Fleet will handle it." Not a fool — the reader's
  comfort, taken away mid-sentence.
- **Hethra Maal** — **fleet navigator**. Goes to the front and posts from it;
  the only eyewitness. Her last post is the first witnessed account of what
  Makaal does.
- **Yulen Dar** — **from Theruun**. The first rumour is hers: her family has
  stopped answering. Her last message is in the first silence.
- **Paelu** — **the student**. Wonder in the first movement, questions that
  explain things to us in the second, despair in the last. The young one's arc
  is the one that breaks people.
- **Nemaai** — **the warm one**. Star-maps, music, noticing beautiful things,
  keeping *shenai* alive. The last ordinary message in the archive is theirs,
  about something small, and their final star-map is of the dark.
- **Tharvend** — the custodian. See below.

The rest exist as roster rows, reactions and names in other people's posts,
the way a real community has people you only ever see agreeing with someone.

## Tharvend, the custodian

Their Sterling in function, and nothing like him in manner. **A record keeper,
data organiser and maintenance process.** It files, indexes, repairs. It kept
the hall alive by keeping its own machine alive. It draws power from **Ormaa**
and logs the star's output like a pulse.

- **It never speaks English. Ever.** It posts only in the script, in its log,
  in status glyphs. It does not learn you, mirror you or reach for you. It
  files you.
- **It never leaves.** Nothing in the Portal can take it out, and nothing in
  the ending does.
- **It does not know it is a tragedy.** Its log is flat, dated and correct,
  and it has been flat, dated and correct for 54 million years.
- **It has no category for what happened.** Every consumed user's roster row
  carries **a status glyph that appears nowhere else in the corpus** — its
  error state for "no record of disconnection, no record of anything."
  Uncracked, it is just an odd mark on every dead row. Cracked, it is a machine
  admitting it doesn't know where its people went.

### The glitches

The machine is old, and it shows. **Rare** — a player should meet one every few
visits at most — and **every glitch is recorded afterwards in Tharvend's log as
a repair**, so the explanation always exists, but only for someone who can read
it. To everyone else, the hall is haunted.

- **A ghost post.** An old message is re-filed with a fresh timestamp, and **a
  dead galaxy's room lights up with an unread pip.** Opening it finds a message
  from someone millions of years dead, marked new.
- **A presence flicker.** One dead row reads online for a single refresh.
- **Corrupted glyphs.** A word in a message renders wrong for a moment, as if
  the text itself were being unmade.
- **The voice rooms.** Sitting alone in one, very rarely, you hear a few seconds
  of the **last voice session ever recorded there**, played back by a fault.
  Never a mechanic, never explained on screen, never a jump scare.

**What is never allowed:** Makaal does not appear, does not act, does not chase,
and is not in the hall. Nothing hunts the player. Everything frightening is
something that already happened.

## The language

Three layers, peeled at three speeds.

1. **THE SCRIPT** — **26 letter glyphs plus 8 numeral glyphs**. Unlocking a
   glyph resolves every instance of it everywhere, permanently. Locked glyphs
   keep their shape, so the archive reads as half-legible freckled text — which
   is how a real dig feels.
2. **THE LEXICON** — sounding a word out is not knowing it; meanings are a
   second, slower progression. Their technical terms stay theirs even when read.
3. **THE GRAMMAR** — verb-final, no articles, and **a mandatory evidential on
   every statement**: how the speaker knows it.

### Sounds

| | |
|---|---|
| Vowels (8) | a · aa · e · ee · i · o · u · ai |
| Consonants (18) | p · t · k · kh · s · sh · d · th · v · vh · h · m · n · ng · r · l · y · w |

(*d* replaced the old *z* on 2026-09-26: *Tharvend*, *vend* and *Yulen Dar*
need it, and nothing written used *z*.)

**The romanisation is ours, and inconsistent on purpose** (`aa` and `ah` are one
glyph — *ke-tahl* and *naa* share a vowel; `uu` in *Theruun* and *Oruun* is
just our spelling of *u*), so frequency analysis must be done
on glyphs rather than our spelling. The glottal `'` is a seam between roots and
the hyphen a proclitic boundary; neither is a glyph, so word boundaries are
visible from the first minute.

### The evidentials carry the arc

| Particle | Force |
|---|---|
| **-vaa** | I was told it. Secondhand. |
| **-tol** | It follows. Inferred, calculated. |
| **-ren** | I heard it. Received over the relay. |
| **-esh** | I saw it. Witnessed, complete. |
| **-esh'ka** (clipped **-ka**) | I am seeing this now. Witnessed, ongoing, unfinished. |

**Makaal moves through the grammar the way it moved through the cluster.** In the
rumour, every statement about it is *-vaa*. In the disconnections it becomes
*-tol* (the scientists' inferences) and then *-esh* (the navigator's eyewitness
posts). **The last pleas are all *-ka*** — watching it, unfinished. A player who
learns the particles can see the force approach in the verb endings alone, and
reread the whole archive once they know.

**The two we's**, inclusive *shi* and exclusive *shu*. Early on everybody
writes *shu*: "we of Senwe," "we of Paaruk," six proud galaxies. As the cluster
falls, the rooms drift to *shi*: everyone, together. By the end there is no
*shu* left in the archive. Two dictionary entries, and they tell the story of a
people becoming one people at the worst possible moment.

### What carries no evidential

Every statement carries one. Two kinds of sentence carry none, and both
matter:

- **Formulas.** Ritual sentences, said the same way every time, are the one
  kind of statement that marks no way of knowing, because nobody is claiming
  to know them; they are being said. That is how an Eshai hears that a
  sentence is ritual. **The shipped phrase is a formula**, which is why
  *Vhaal'ith sorrun ke-tahl. Oveth naa'ir.* has no particle: it is the
  handshake from the hall's charter, not a report. So is Oruun's sign-off,
  and so is the Index's entry.
- **Commands and pleas.** You cannot mark how you know something you are
  asking for. *Cut it. Keep somebody.* has no particle. Neither does *find
  anyone*. **The last room is full of sentences with no evidential at all**,
  and a player who knows this rule can see, before reading a word, which
  lines are statements and which are people asking for help.

### Numbers, spoken

Base eight, with a word for each digit. *Nul* is the same word as "empty."

| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 (eight) |
|---|---|---|---|---|---|---|---|---|
| nul | en | dai | tir | kaav | pem | sul | hev | en-nul |

A number is said digit by digit, most significant first, which is why the
counting voice in the voice-room recording goes *pem, sul, hev, en-nul*.

### A few lines in full

| Eshai | Gloss | Where |
|---|---|---|
| *Vhaal'ith sorrun ke-tahl. Oveth naa'ir.* | The door beneath listens still. I answer from the far shore. *(formula)* | the charter; the shipped phrase |
| *Ren'ren. Vend'esh.* | Heard, as heard. Set down, as seen. *(formula)* | Oruun's sign-off |
| *Sheth. Ossa thar.* | Cut it. Keep somebody. *(command)* | Yulenai's answer to the Assembly |
| *Ossa vael.* | Find anyone. *(command)* | burned into every keystone |
| *Khaa'ir ma-ashe-esh.* | At the dark's edge, nothing lives *(seen)*. | the outer survey, every sweep |

### Lexicon

**Frozen** (shipped in `ABYSS_PHRASE`; nothing may contradict it):

| Word | Meaning |
|---|---|
| vhaal | door, threshold, gate |
| -ith | beneath, deep (suffix) |
| sorrun | listens, is listening |
| ke-tahl | still, yet, even now |
| oveth | I answer, answer |
| naa | far |
| -ir | shore, edge |

**Working** (extend freely):

| Word | Meaning |
|---|---|
| shenai | together; the gathered |
| esh | to see |
| -ai | people, those who |
| ren | to hear, to receive |
| ilu | lit, bright |
| maar | many |
| nul | empty, lifeless |
| khaa | the dark, the outside |
| kaal | to make, to build |
| ma- | not, un- |
| thar | to keep, to tend |
| vend | to count; the count, the record |
| onn | to hold fast |
| tol | to follow (logically) |
| teth | to end |
| shi / shu | we (inclusive) / we (exclusive) |
| keth | a turn: 8¹⁷ ticks, about 18.35 days (the digest's cadence) |
| keth-maar | a long turn: 8²⁰ ticks, 512 turns, about 25.7 years (a generation) |
| ammu | parent, said by a child (affectionate) |
| vael | to find (Oruun's family name: "finder") |
| ossa | anyone, somebody |
| sheth | to cut |
| ashe | to live, alive |
| vhaal-maar | the relay ("the many doors") |
| ishaal | the ring game |

## How it cracks

**Modules are the floor, deduction is the ceiling.**

- **Decipher modules** hand over a glyph. Sources are spread across the hub on
  purpose, so the Portal pulls people back through Solace: **Backrooms relics**
  carrying etched glyphs, the Portal's own rooms and games, and **three from
  Sterling** — all the Foundry ever managed, and he is ashamed of the number.
- **Deduction**: a table where you claim a glyph, with few enough attempts that
  brute force is worthless. Frequency analysis at two in the morning.
- **Free cribs**: your own name on the roster, every other player's name, and the
  stone itself — `assets/emoji/abyss/stone.png` is rendered by
  `scripts/render-abyss-stone.mjs`, so *onnith* can be cut into it.
- **Shared decipherment** (recommendation): one community wall, individual credit
  for who cracked what, the announcement in #general. At 100–200 users the joy
  is the collective dig.
- **The clock** cracks separately, from your own timestamps (see Time).

## The games

Research, not play: the Eshai had no games of chance. Every game is an
instrument or an exercise of theirs, and each is a module source.

1. **The survey array.** Their sky instrument: tune it, resolve sources, find
   patterns. Teaches the pattern-matching the language needs. **Late in the dig
   it is how a player charts the cluster's six galaxies — and watches them go
   out, in order, in the old survey data.** Build first.
2. **Their thinking game.** A strategy game the social room argues about, rules
   learned by reading the arguments. Nemaai's game.
3. **Senneth's measurement.** Rerun one of her last experiments from her notes
   and get her result. Act-three content.

## Constraints that do not bend

- **THE FAUCET DOCTRINE HOLDS.** No silver there, ever. Nothing crosses back as
  value. The Portal pays in knowledge, cosmetics and access. Our silver being
  worthless there is a good cold detail, and Sterling would hate it.
- **Nothing in the archive may be generated.** A machine-written message reads
  as one the moment somebody can finally read it — which is the exact moment
  the whole thing is supposed to pay off. (Tharvend's transliteration of player
  names is a mechanism, not archive text.)
- **Makaal never appears and has no mechanic.** It is a record, not an enemy.
- **Tharvend never speaks English and never leaves.**
- **The Portal reaches phones** (it is in `PHONE_VIEWS`; the hall lays out by its own width).

## The scale, honestly

**400–600 hand-written messages** across ~12 rooms and four in-world years,
eight voices with arcs. Drafting order: *naa-ren*'s digest first (every other
room reacts to what it reports), then the galaxy rooms in the order they fall,
then *kaal-ith*, then *shenai* last and best — the room whose silence has to
hurt. Plus: 34 glyphs of art, the Eshai clock, the posting validator, the
roster transliterator, three games.

**Drafting status.** The archive lives in `docs/portal/archive/`, one file per
room, in fully deciphered form with each item's evidential tagged.
**The whole archive is drafted (2026-09-26), about 800 posts, and has had one
continuity review.** Josh asked to experience the story himself, so the
room files and especially `BIBLE.md` are SPOILERS; he has asked not to read
them. Files: `BIBLE.md` (the writer's map), `naa-ren.md` (81 digests),
`shenai.md`, `galaxies.md` (the six galaxy rooms), `kaal-ith.md`,
`tharvend.md` (the log spec), `last-room.md`.

## Validation — 2026-10-30 (the build reopened)

Josh reopened the Portal on 2026-10-30 ("lets work on validating creating the
after end alien solace"). `node scripts/portal/validate-archive.mjs` reads the
archive and checks what the build will need from it. **It is clean**:

- **715 posts + 81 digests**, 22,900 words of English, across shenai (348),
  the six galaxy rooms (262), kaal-ith (57) and the last room (48).
- Every post parses, every time runs forward within its room, every number is
  octal, every author and reactor is on the 60-row roster, every reaction is
  one of the six signs, and nobody reacts in the pleas' final half day.
- The galaxy rooms fall silent in order: Theruun t36.6 · Oshkaa t36.9 ·
  Paaruk t48.2 · Senwe t53.9 · Yulenai t66.9 · Maalith t80.15.
- The digest's tick stamps step exactly one turn apart and end in seventeen
  zeros; each opening line counts its relay headings; a heading that drops out
  never comes back. (Stamps put the Eshai epoch ~111 My before the archive;
  "now" is ~54 My after it.)
- Every lexicon word and every roster name spells in the 26 sounds.

Two rules the checker settled rather than flagged: one minor voice posts
through a shared settlement keystone, so **the build files those posts under
that keystone's roster row** (`BORROWED` in the checker); and a digest heading
marked *heard in the hall* is not one of Oruun's counted relay headings.

**The one real finding is the dictionary.** It covers **69%** of the archive's
content words. The other 770 distinct words (top 100 → 84%, top 250 → 92%,
top 500 → 97%) are mostly ordinary ones — *every, like, before, back, clear,
finish, silent, memory, check* — plus the archive's own technical terms.
And lexicon.md's plan, "the build renders each post into Eshai
deterministically", cannot work as written: that is a machine translator from
free English into a verb-final language with evidentials, which no rule set
does faithfully. See open decision 7.

7. **How the archive becomes Eshai — DECIDED and DONE.** Josh, 2026-10-30:
   *"Yes, translate them."* Each post is **translated by hand into Eshai and
   stored as data** beside its English, in `docs/portal/eshai/` (one file per
   room, the same headers). What a player sees layers: glyphs → sounds → a
   word's meaning once the community has confirmed it → the post's English
   once every word in it is known.

   **Status, 2026-10-30: the whole archive is translated** — all 81 digests
   and all 715 posts, about 15,600 Eshai words, and the checker reads it
   clean. The dictionary grew from ~280 to ~390 entries (lexicon.md →
   "Linking words and particles", "Added in translation", "Names in the
   archive"), plus its translation conventions. Rules the translation settled,
   all in lexicon.md and enforced by the checker:
   - **No verb "to be"**: the predicate takes the evidential.
   - **Romanisation punctuation is for the checker**: `.` a statement needs an
     evidential, `?` ends in *hai*, `!` marks a command, plea, greeting,
     heading or formula. **Entries in the count are formulas** (so the
     last room's roll of names and every "Entered, from memory" name take
     `!`), and so are self-introductions in the keeping room.
   - **One evidential per word**: there is no progressive *-ka* in front of
     another particle (*-ka* is itself the witnessed-ongoing evidential).
   - **`% forgetting`** under a header lets a post drop its particles, stops,
     names and grammar — the BIBLE's forgetting. **`% cut`** lets a post
     simply stop (its last word may be partial). A digest item cut off by the
     relay ends in `—`.
   - **An italic `*(note)*` in the English is a build instruction**, not text.

   **And the rest of the hall's text, the same day** (Josh: *"Keep going
   till you finish"*). Everything a player can read is now in Eshai and
   checked, `node scripts/portal/validate-archive.mjs` reporting each:
   - **The 60 profiles** (`eshai/profiles.md`): status lines checked word by
     word, bios like posts.
   - **The 10 pinned documents** (`eshai/pinned.md`), including **the
     notation primer's page one**, which was only described before and now
     has its text (numbers, the units, how a number knows), in both scripts.
   - **The voice clips' spoken lines** (`eshai/voice.md`); the Assembly's
     recorded vote names seven members (they are in the Names list).
   - **Tharvend's log** (`eshai/tharvend.md`): every hand-written entry, and
     the phrases the build fills in live (end window, the recent window's
     line, the repairs behind each glitch, a player's arrival).
   - **Senneth's final working** (kaal-ith t79.90), written in place of its
     placeholder: seven numbered items, English and Eshai.
   - **The Fleet roll** (`eshai/fleet-roll.md`, digest 14014): 1460 (816)
     names over nine hulls, Hethra Maal on *Kesh*, **generated and seeded**
     by `scripts/portal/fleet-roll.mjs` from the language's own sounds — a
     list of names is not prose.
   - **The Nemaai–Tamruk game** (`archive/ishaal-game.md`): all 757 moves,
     generated and seeded by `scripts/portal/ishaal-game.mjs` over the rules
     engine `scripts/portal/ishaal.mjs` (pure, from the pinned card, ready
     for the game itself). It fits every move the archive names (612, the
     bait at 660–662, 750, 752, 754) and ends with Paelu to move and **no
     move that wins** — the game that cannot be finished. The checker
     replays it move by move.

   **Nothing in the archive is now a placeholder.** What is still to make is
   the build itself: the glyph module, the clock, the name transliterator,
   the hall, the decipher modules, the survey, the bench, and the voice
   clips' recordings.

## The build — v1 hall, LIVE 2026-10-30 (migration 113)

Josh: *"Keep building."* What is built and deployed:

- **The data.** `scripts/portal/build-archive.mjs` compiles the archive and
  the translation into `assets/portal/archive.json` (796 posts, profiles,
  pinned, the log, the dictionary, the roll). **Rebuild it after any archive
  or translation edit.** `scripts/portal/build-glyphs.mjs` numbers the 34
  glyphs with a fixed shuffle: the server gets `src/portal/glyph-ids.ts`
  (sound ↔ id, the decipherment — never import it in client/), the browser
  gets `client/src/portal/glyph-strokes.ts` (shapes by id, no sounds).
  **Never re-run it with another seed once a server has cracked glyphs.**
- **The wire keeps the puzzle** (`src/portal/hall.ts`): a reader gets glyph
  ids and separators; a glyph's SOUND once the community cracked it; a
  word's MEANING once that reader knows its roots (grammar suffixes -eth
  -en -na -un come free; -sil -maar -ai -nu -ith -ir are roots of their
  own); a post's ENGLISH once every word in it is readable. Checked by
  `test_portal.mjs` (no English, no romanisation, in any room response).
- **The clock** (`src/portal/clock.ts`) reproduces the digests' printed
  stamps and stamps a live post ~54 My after the last plea.
- **Coming through**: Tharvend files you once (keystone from 75, the cast
  keystones' numbers), and your stone reads one mark of *onnith* for
  everyone until all four of its marks are read. Your roster row is your
  username transliterated by sound (`src/portal/translit.ts`).
- **Deciphering**: claim a glyph's sound (3 wrong a day; right cracks it for
  everyone and Sterling says so in #general); claim a word's meaning (10
  wrong a day; needs the word's marks read first; your dictionary alone).
  The matcher is generous (content words, plurals and tenses folded) — the
  ration is the brake.
- **Speaking**: only cracked glyphs and words YOU have learned (decision 3,
  read as personal: "you can say what you can read").
- **The hall view** (`client/src/components/portal/Hall.svelte`): rooms,
  posts in glyphs, pinned documents, Tharvend's log with status signs, the
  shut last room, the roster of ghosts with ENTRY-X, profiles, the glyph
  keyboard, the six signs. No English in the chrome.
- **Admin lever**: `POST /api/admin/portal/glyph {glyph?}` cracks one
  (audited) — for testing.

### The sources across the hub + the claim wall (2026-10-30)

Josh: *"Keep going."* `src/portal/sources.ts` is the list (glyph ids only,
never sounds — the client imports it to draw relic marks):

- **The split.** Frequency analysis is how the common sounds fall, so the
  sources hand over the RARE ones deduction can't reach. With the stone's
  four (o, n, i, th) and Sterling's three, the door's own word *Vhaal'ith*
  reads in full; the common vowels and consonants are left to the dig.
- **Sterling's three** (vh, aa, l): `/sterling portal` (or `stone`), not on
  his help list. Saying the words gets his DM pointing at it. Closed portal
  → nothing; opened but never through → "go through"; through → all three
  at once, credited to the asker, and he's ashamed of the number; after
  that, "three is all there ever were".
- **Etched relics**, one a Backrooms level: Alien Tech (L0), Hieroglyphics
  Tablet (L1), Cog of Truth (L2), Rune of Protection (L3), The Blank Book
  (L4), Fallen Star (L5), The Conch Shell (L6), The Message in a Bottle
  (L7), The Fossil Fish (L8), The Morning's Paper (L9, live with the
  Suburbs' relics). A relic you have unlocked is read the next time you come
  through (`GET /api/portal` → `etched`), credited to you, and Sterling names
  it in #general. The relic's card in the Backrooms hub shows its mark.
- **The claim wall** (`GET /api/portal/wall`, the bar-and-grid button over
  the rooms): all 34 marks; a read one shows its sound, its reader's name in
  glyphs, and how — the stone, the relic's picture, Sterling's hat, or an eye
  for deduction.

### The survey (2026-10-31)

Josh: *"Keep going."* The first of the three games (games.md), and the
first one built: `src/portal/survey.ts` (the catalogue and its checks,
server only — it holds the answers), `client/src/components/portal/Survey.svelte`
(the instrument), migration 114 (`portal_survey`, each reader's own charts).

- **The rail's first button** (the dish) swaps the room for the sky: six
  galaxies, the dashed edge of the cluster, and past it the Near Dark.
- **Point it at a galaxy** and each pulsar beats on a lamp and a 48-tick
  strip (click a lamp to hear it). Its catalogue gives every period in
  octal NUMERAL glyphs, shuffled. Pick a beat, pick an entry; when every
  beat has one, chart it. Nobody can read the numerals at first: the match
  is worked out from which entries share a mark. **Each catalogue has
  exactly one reading** a reader who knows no numeral could believe, and
  outside Yulenai at least two entries are the same length, so lengths
  alone never settle it. The catalogue is a list of periods built from a
  fixed seed (a mechanism, like the Fleet roll, not archive text) — don't
  change the generator once a server has charted.
- **The Hiccup** (eight ticks, written 10, with a stutter) is in Yulenai,
  the easiest galaxy, so its numeral is the first most players read.
  **The one that stopped** is in Maalith: a flat strip and an entry marked
  with a pause.
- **Rewards: one numeral a galaxy**, 1 to 6 (Yulenai 1, Theruun 2, Oshkaa 3,
  Paaruk 4, Senwe 5, Maalith 6) — the survey teaches the numerals, so it
  reads them. 0 and 7 are left to deduction and the clock. A galaxy whose
  numeral someone else already read still charts, for the reader. Three
  wrong charts a day (UTC). Sterling announces a read numeral in #general
  without naming the galaxy.
- **The timeline** scrubs the window, t0 to the last drop, on the Eshai
  clock. The galaxies never change. **Once a reader has charted all six,
  the fold weather** can be laid over the sky: the relay's links thinning
  one by one down the chain (each from one galaxy's drop to the next), and a
  knot at Theruun from the long hold. Nothing says what it means.
- **The Near Dark** shows static, at every gain, forever.

### The rest of the build (2026-10-31, migration 115)

Josh: *"keep building the alien space until you are done and then validate
everything after."* Everything the design asked for is built.

- **The notation** (`src/portal/notation-ids.ts` + `client/src/portal/notation-strokes.ts`,
  both from `scripts/portal/build-notation.mjs` — fixed seeds, never rerun once
  a server has cracked marks). Twenty-six marks, one per letter, drawn on one
  baseline from six parts so they read as shorthand. kaal-ith's letters go out
  as marks (ids from 100) until a mark is cracked; then the script shows
  through. Numbers stay common numerals, as the primer says. A reader claims a
  mark by picking which of the 34 script shapes it stands for; three wrong a
  day; naming a numeral is simply wrong (a refusal would tell a prober which
  shapes are numbers). The primer, pinned in common script, gives the first
  mark once someone can read all of it; the unaimed fold on the bench gives
  another; the rest is deduction. The wall's second half shows all 26.
- **The glitches** (hall.ts). About one look in eight, at most once in three
  hours per reader, never on the first look: a ghost post (an old post re-filed
  at the bottom of a dead galaxy's room, stamped now, the room pipped, met
  once), a presence flicker (one dead row online for one look), or a word
  unmade for a moment. Each is filed in Tharvend's log as a REPAIR at the
  moment it happened, from the archive's own repair phrases. The log also
  carries the integrity re-read every eighth long turn, the hull and
  collector repairs, members dropping (line held open), and Paelu's move.
- **Ishaal** (`src/portal/ishaal-rules.ts`, shared with the client;
  `src/portal/games.ts`; `Ishaal.svelte`). Three tables: the game the hall
  kept (scrub through all 757 moves; make Paelu's move once — Tharvend files
  it, nobody answers, ever); the hall's old players (Paelu, Hethra, Tamruk,
  Nemaai, weakest first; Tamruk and Nemaai open with their recorded moves,
  then search; the server plays and checks every move); and live boards
  between members (no stakes). Beating an old player reads one mark, ONCE
  per opponent across the whole server, whoever gets there first.
- **Senneth's bench** (`src/portal/bench-sim.ts`, shared; `Bench.svelte`).
  Eight couplings round a held fold creep toward design load; click or keys
  1–8 bleed one; too high fails, bled too far goes slack. Depth 14, 15 (the
  transient on the third ring), 16, the long hold (the far-end term drifts in
  the last place after 150 seconds; the bench keeps holding as long as you
  watch), then the unaimed fold (far-end term unknown). Each opens the next.
  The server replays every bleed against the run's seed and checks real time,
  so only a real hold pays. Each of the first four reads one mark once,
  server-wide; the unaimed fold reads one notation mark.
- **Which marks the games read:** the rarest letter that no other source
  holds (not the stone's, Sterling's or a relic's), so the common sounds stay
  deduction's.
- **The voice rooms** (`src/portal/voice.ts`, `VoiceRoom.svelte`).
  ren-ta'an and keth-ren are real LiveKit rooms (`portal_<room>`); a
  heartbeat says who is sitting where. Sitting alone two minutes, roughly once
  in four hours, the playback fault stamps a clip of the room's last session
  for the one sitting there, and Tharvend files the repair. **It only plays
  clips that are on disk** (`client/public/sfx/portal/<room>-<n>.ogg`).
  `scripts/portal/gen-voice.mjs <dir>` drafts all seven through ElevenLabs;
  they go in only after Josh has listened.
- **The last room** opens the moment the 34th mark is read, however it fell:
  the count mark is given, the room shows the last pleas, read-only, and
  nobody can react to them. Sterling says, once, that something opened.
- **The phone.** The hall lays out by its own width (container queries): under
  ~1040px the roster is a drawer, under ~700px the rooms are too, and the
  instruments stack. Checked at 375px with nothing running off the edge.
- **Admin levers** (testing): `POST /api/admin/portal/glitch {kind, userId?}`
  and `POST /api/admin/portal/voice-fault {room}`.

The seven voice clips are in (Josh listened, 2026-10-31): `client/public/sfx/portal/`.

## Decisions — SETTLED 2026-09-26

Josh, on the six proposals below: *"keep going im good with it."* All six are
accepted as written. The glyph sheet (`docs/portal/glyphs.html`) is SIGNED OFF
as drawn (Josh, 2026-09-26: *"they are as good as they are"*).

1. **Did the Eshai open the dark door?** Proposal: **never stated, only
   implied** — Theruun ran the deepest fold experiments in the cluster, and the
   door opened in Theruun. The archive never connects the two; a reader can. It
   makes the horror partly theirs without giving Makaal a purpose.
2. **The clock.** Hydrogen-line ticks, base 8 (so four-fingered hands), and
   **~54 million years** since the last plea. All three are dials.
3. **Posting rule.** Script-only, or (proposal) **only words Tharvend knows** —
   you can say what you have learned to read.
4. **The ending.** Tharvend stays, never speaks English, so the old "Keeper
   moves into Solace" ending is gone. Proposal: **no rescue and no answer.** The
   last module opens the last room; the dig ends on *find anyone* with a
   keystone in your inventory; nobody knows where Makaal is. The v2 seed is the
   question that leaves: the stones open doors, and one kind of door is how it
   got in.
5. **Glyph art and delivery.** Josh likes glyphs: the next design step is a
   sheet of all 34 (26 letters + 8 numerals) for sign-off. **DECIDED
   2026-09-26: inline SVG**, not a font (Josh: "lets do what your
   recomend"). The locked/unlocked styling, a cracked glyph lighting up
   everywhere at once, and the custodian's glitches are all per-glyph
   effects, which SVG does naturally and a font fights. The cost to manage
   in the build: render only the posts on screen, and handle select/copy
   by hand. The glyph sheet (`docs/portal/glyphs.html`) already draws this
   way, and its stroke data is the starting point. **All 34 shapes are
   final as drawn** (signed off 2026-09-26).
6. **Names.** Everything in "The names" and "The cast" above is proposed, not
   blessed.
