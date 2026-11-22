# The Eshai dictionary (ARCHIVE DRAFT, SPOILERS)

Enough language to render the whole archive in Eshai. The archive is
authored in its deciphered English form, and **every post is translated by
hand into Eshai** with this grammar and this dictionary (decided 2026-10-30,
PORTAL.md open decision 7). The translations live in `docs/portal/eshai/`,
one file per room in the same layout as the English, each post under the
same header, and `node scripts/portal/validate-archive.mjs` holds them to
this file: every word in it, every sentence ending the way the grammar says.
That is translation of hand-written text, not generation of it, so the
"nothing in the archive may be generated" rule holds.

PORTAL.md's language section is the summary; this file is the reference.
Words frozen by shipped code are marked **(frozen)**.

---

## Sound and spelling

- **Letters** (26 glyphs): vowels *a aa e ee i o u ai*; consonants *p t k kh
  s sh d th v vh h m n ng r l y w*. Syllables are (C)V(C). Doubled
  consonants are two glyphs (*sorrun*).
- **Our spelling is inconsistent on purpose**: *ah* before a consonant is
  the *aa* glyph (*ke-tahl*), and *uu* in a name is just *u*.
- **'** joins roots in a compound (*vend'onn*); **-** marks a proclitic or
  prefix (*ke-tahl*, *ma-ashe*). Neither is a glyph.

## Grammar for the renderer

**Word order** is subject, object, verb. The verb is last, and the
evidential is the last thing in the sentence, suffixed to the verb.

> *Mu Maalith pai wa-esh.* — I went to Maalith *(seen)*.
> I · Maalith · to · go-SEEN

**No articles.** No gender. **Plural** is *-en* (*keth-en*, turns), and is
left off when a number or *maar* (many) already says it.

**Pronouns.**

| mu | tei | hen | shi | shu | teien | henen |
|---|---|---|---|---|---|---|
| I | you | he, she, they (one) | we (incl. you) | we (not you) | you (many) | they |

**Possession** is by order: owner first. *Maalith sil*, Maalith's hall;
*mu ammu*, my parent.

**Postpositions** follow their noun.

| tho | pai | ul | sa | om | rin | ir |
|---|---|---|---|---|---|---|
| in, at | to, toward | from | with | for | about | at the edge of |

**Tense** is left to context. The **evidential** already says whether a thing
is done (*-esh*, seen, complete) or happening (*-ka*, seeing it now).
**Future** takes the prefix *ho-*: *ho-wa*, will go.

**Negation** is *ma-* on the verb: *ma-ashe*, does not live.

**Questions** end in *hai*, which takes the place of the evidential (you
cannot mark how you know what you are asking): *Tei yamu hai?* Are you
eating?

**Commands and pleas** carry no evidential. Neither do **formulas**. See
PORTAL.md → What carries no evidential.

**Linking.** *a* and · *velu* but · *tolen* because · *yem* if · *tekev*
then · *ke* still (the continuative, as in *ke-tahl*).

**Relative clauses** come before their noun, verb-final, with no marker:
*Mu wen-esh ai*, the person I saw.

**Numbers** are octal, said digit by digit (PORTAL.md). **Ordinals** add
*-na*: *enna* first, *daina* second, *tethna* last.

## Writing the archive in Eshai (translation conventions, 2026-10-30)

The rules the hand translation follows, beyond the grammar above.

- **No verb "to be."** The predicate takes the evidential: *Tai orm-esh*,
  the star is steady *(seen)*; *Hen urai-esh*, she is a navigator. *Khaa'ir
  ma-ashe-esh* is this shape.
- **Modifiers come before what they modify**, like relative clauses:
  *tuv ilma*, a big galaxy; *sul yathi*, six headings (no plural after a
  number); *shaa vai*, very good.
- **Time and place open the sentence**: *Kev tho hena …*, now, here, …
- **Comparison**: the standard takes *ul* (from) and the quality takes
  *yai*: *Theruun Oshkaa ul yai naa-esh*, Theruun is farther than Oshkaa.
- **Reported speech** comes before the verb of saying, whole: *"Kesh tho
  anam" lo-esh*, she said "stay on the Kesh."
- **The evidential is a hyphenated suffix on the sentence's last word**:
  *wa-esh*, *ma-ashe-esh*, *ho-ye-tol*. A sentence of several clauses joined
  by *a*, *velu*, *tolen* may mark each clause; the last word always does.
- **Names keep their own form** (people, galaxies, worlds, ships, places).
  The validator holds them to the Names list at the end of this file.
- **Numbers are written as octal numerals** and render as numeral glyphs.
- **Punctuation in our romanisation tells the validator what a sentence
  is**, and renders as the same plain stop: `.` a statement (needs an
  evidential) · `?` a question (ends in *hai*) · `!` a command, plea,
  greeting or formula (takes none — PORTAL.md → What carries no
  evidential). *Vhaal'ith sorrun ke-tahl! Oveth naa'ir!*
- **Taken mid-sentence.** A post that simply stops carries a `% cut` line:
  its last sentence needs no stop and no particle. Its words are still checked.
- **The forgetting.** A post written as somebody loses themselves drops its
  evidentials, then its names, then its grammar (BIBLE → Makaal, 3). Such a
  post carries a `% forgetting` line under its header, which tells the
  validator the missing particles are the point.
- **Translate the meaning, not the English words.** Eshai is plainer than
  English and a post may come out shorter; a word the dictionary lacks is
  said around, or added below, never borrowed.

## Building words

| Piece | Makes | Example |
|---|---|---|
| **-ai** | one who does, or a people | *vend-ai*, indexer (one who counts); *Eshai*, those who look |
| **-eth** | the thing or the act | *vendeth*, a calculation; *thesheth*, a paper |
| **sil-** / **-sil** | a place for | *lethsil*, reading room; *kelsil*, council chamber |
| **mir-** / **-mir** | a tool for | *ilmir*, lamp (light-tool) |
| **-ith** | deep, under | *vhaal'ith*, the door beneath |
| **-ir** | edge, shore, far end | *naa'ir*, far shore |
| **-nu** | small, dear | *ilnu*, child (small bright one) |
| **-maar** | many, the many | *khul-maar*, the Fleet (many hulls) |
| **ma-** | not, un- | *Makaal*, the unmaking |
| **ke-** | still, continuing | *ke-tahl*, still, even now |
| **ho-** | will | *ho-yeth*, will arrive |
| **-na** | -th (ordinal) | *kaavna*, fourth |
| **'** | compounds two roots | *vend'onn*, to enter into the count (count-hold) |

## The roots

### Being, knowing, saying

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| ashe | to live; alive | | teth | to end; to die; death |
| esh | to see | | ren | to hear, receive |
| sorr- | to listen (*sorrun*, listens) **(frozen)** | | wen | to look |
| yul | to know | | mael | to think |
| annu | to remember | | ma-annu | to forget |
| seth | to doubt, weigh | | tol | to follow (logically) |
| lo | to say, speak | | vol | to tell |
| ki | to ask | | oveth | to answer **(frozen)** |
| thesh | to write | | leth | to read |
| thei | name; to name | | loth | word |
| lohu | voice | | kieth | question, problem |
| eeth | true, right | | khelu | wrong |
| ae | yes | | ma | no |
| vai | good; all right | | ma-vai | bad |

### Doing

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| kaal | to make, build | | tamu | to repair |
| khet | to break | | sheth | to cut |
| thar | to keep, tend | | onn | to hold fast |
| vend | to count; to set down | | vend'onn | to enter into the count |
| vael | to find | | ruth | to lose |
| dam | to give | | hol | to take |
| pevi | to send | | helu | to bring |
| kavu | to carry | | ulo | to lift |
| dop | to fall | | rum | to move |
| wa | to go | | ye | to come |
| yeth | to arrive | | sheva | to leave |
| anam | to stay | | yevi | to return |
| tahli | to wait | | halo | to stop |
| esa | to begin | | vhen | to open |
| vhom | to close | | shul | to flee, run |
| pelu | to walk | | tar | to stand |
| hed | to sit | | munu | to sleep |
| vesu | to wake | | yamu | to eat |
| savo | to work | | ennu | to help |
| hesi | to need | | lai | to want |
| piru | to try | | annet | to learn |
| sholu | to teach | | shiru | to measure |
| kel | to decide, vote | | sama | to agree |
| dekh | to argue | | kharo | to fight |
| ishu | to play | | tovu | to win |
| hael | to thank | | sehu | to be sorry |
| yenu | please | | vosh | to knock **(old lexicon)** |
| ahel | to laugh | | sulo | to weep |
| humu | to hum | | vakh | to shout |
| hura | to call | | shisha | to whisper |

### Feeling

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| ulen | to love | | vokh | fear; to be afraid |
| ilai | hope | | ma-ilai | hopeless |
| ahi | glad | | wesh | tired |
| haru | warm | | khol | cold |
| ta'an | company, the good noise of people | | tethul | grief |

### People

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| ai | person | | ilnu | child |
| ammu | parent (a child's word) | | senu | sibling |
| thavi | partner | | ta'ai | friend |
| thel | line, lineage, family | | anai | student |
| sholai | teacher | | vendai | indexer |
| urai | navigator, pilot | | thar-khul | commander |
| lo-ai | speaker | | tethai | the dead |
| nul-ai | nobody | | tamm-ai | everyone |
| ossa | anyone, somebody | | Eshai | the Eshai |

### The hall, the digest, the count

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| sil | hall, room | | Naa'shenai | the hall (their Solace) |
| shenai | together; the gathered | | onnith | keystone |
| vhaal | door **(frozen)** | | vhaal-maar | the relay |
| naa-ren | the digest (the far hearing) | | yathi | heading (of the digest) |
| renlo | report | | vaalo | rumour (told-speech) |
| enni-ren | news | | peshu | letter |
| vend | the count | | Vend-sil | the Great Index |
| kodi | book (of the count) | | onnu | shelf |
| lethsil | reading room | | vend'onneth | an entry |
| shem | the count mark | | Kel-maar | the Assembly |
| kelsil | council | | orth | rule, law |
| ranu | order, sequence | | Tharvend | the custodian |

### The cluster and the sky

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| ilma | galaxy | | Ilumaar | the cluster |
| aru | world, planet | | tai | star, sun |
| mel | moon | | vei | sky |
| khaa | the dark, outside | | ilun | light |
| ilu | lit, bright | | nokh | night |
| sau | day | | keth | turn **(Portal lexicon)** |
| keth-maar | long turn | | tahl | duration, time |
| ushu | breath | | kev | now |
| tai-tu | pulsar | | tu | beat, pulse |
| tuleth | pulse music | | hollu | sound |
| nulren | silence; quiet | | ormeth | map |
| tai-pelu | comet (walking star) | | aru-shul | rogue world (fleeing world) |
| tai-vakh | flare | | tai-teth | supernova |
| shehu | weather | | ir | edge |
| naa | far **(frozen)** | | shen | near |
| ith | deep | | mesu | centre |

### The work

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| thaavi | fold | | maarmir | the deep array |
| mirkaal | instrument | | shel | glass, lens |
| ithen | depth | | sendu | coupling |
| shiruth | a reading, measurement | | vendu | number |
| keru | transient | | onn'ir vendu | the far-end term |
| thesheth | paper | | vendeth | calculation |
| maelith | theory | | khaa-ren | fold physics ("dark-hearing") |
| ruma | matter | | vira | energy |
| yuleth | information | | lelu | pattern |
| asheth | life | | esheth | trace |
| wenvend | the survey | | sumu | channel |
| silir | station (edge-hall) | | renu | signal |
| Makaal | the unmaking | | Khaa'vhaal | the dark door |

### The Fleet and the yards

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| khul | hull | | khul-ai | crew |
| khul-maar | the Fleet | | vessa | ship |
| kaalsil | the yards | | tai'ulo | star-lifting |

### Home

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| hem | house | | hemi | home |
| kovu | roof | | hemmaar | town, city |
| oluma | garden | | lilu | flower |
| doma | tree | | sui | seed |
| uma | water | | uma-maar | ocean |
| dovu | valley | | hullu | hill |
| vare | wall | | tarru | terrace |
| yam | food | | yethsil | landing field |
| ilmir | lamp | | vhaal'ilun | window |
| shol-sil | school | | Shol-maar | the academy |
| sholeth | lesson | | sholketh | term (of the academy) |

### The ring game

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| ishaal | the ring game | | vhoru | ring |
| peki | spoke | | lith | stone (a playing piece) |
| tavu | board | | khava | bait |

### Size, amount, time

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| tuv | big | | nu | small |
| ossu | old | | enni | new, young |
| orm | steady | | maar | many |
| nuri | few | | tamma | all, whole |
| nul | none, empty, zero | | yai | more |
| shaa | very | | enen | only |
| yo | also | | ruvi | again |
| enna | first | | tethna | last |
| wana | next | | kheru | late |
| pothu | early | | shenkev | soon |
| tammavi | always | | nulvi | never |
| hena | here | | tena | there |

### Greetings

| Eshai | Meaning |
|---|---|
| *Ta'an.* | Hello. ("Company.") |
| *Onn.* | Goodbye. ("Hold fast.") |
| *Hael.* | Thank you. |
| *Sehu.* | I'm sorry. |

---

### Evidentials

The particle on the sentence's last word: how the speaker knows. A reader
learns them like any word.

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| vaa | told; secondhand | | tol | it follows; inferred, calculated |
| ren | heard over the relay | | esh | seen; witnessed |
| ka | seeing it now; unfinished | | | |

### Linking words and particles

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| a | and | | velu | but |
| tolen | because | | yem | if |
| tekev | then | | ke | still (continuative) |
| hai | (question; ends a question) | | ho | will (future prefix) |

### Added in translation (2026-10)

Roots the hand translation needed, added as it went. Same rules as above:
(C)V(C) syllables, the 26 sounds, one meaning per form.

| Eshai | Meaning | | Eshai | Meaning |
|---|---|---|---|---|
| ti | this | | ta | that |
| vi | time, occasion | | envi | once |
| nim | before, in front of | | dor | after, behind |
| temu | when (the time that) | | kae | where |
| kevai | why | | olu | like, as |
| som | thing | | ru | place |
| omu | same | | oth | other |
| dalu | part | | hosh | enough |
| vos | through, past | | shiu | clear, open (a channel, a sky) |
| dosh | to finish, complete | | tash | to hurry |
| tavi | to put, hang | | anvu | to lead |
| shenu | to meet | | tesh | to touch |
| ruk | to burn | | thom | layer |
| yathom | record (the best ever) | | vosu | ceremony |
| vaku | bold, daring | | thalu | blue |
| vesk | lattice | | dith | fingernail |
| ulsu | sample | | lom | way, road |
| kesu | surface, ground | | dovi | box |
| hesu | to be born; birth | | veru | green |
| pesh | to spread | | khev | fast, quickly |
| tulo | poem | | mevu | season |
| lisu | hand | | vashu | insufferable, smug |
| khom | to grind | | ilsa | beautiful |
| shim | to clean | | kel-ai | councillor |
| khethi | strange | | tiru | exact, exactly |
| tameth | a repair | | sem | grey |
| duv | thick | | anvu-mir | controls (lead-tool) |
| tharu | ready | | thoru | used, worn out |
| selu | to sing | | khim | to stick, jam |
| nulu | hole | | vel | proud |
| vas | above, upstairs | | taku | to lean |
| loma | meaning; to mean | | eshom | picture |
| kesku | stem | | olsu | pale |
| lehu | bell | | khemu | moss |
| sesh | grass | | esu | white |
| vadu | to trade | | dumu | heavy |
| khasu | rude | | ushi | secret |
| viru | to shake, tremble | | tusu | resonance |
| rael | reversed, inverted | | seshu | probably |
| tumu | hidden; to hide | | kithe | to aim |
| thesh-lom | notation (writing-way) | | ukku | hiccup; the Hiccup (a pulsar's signature) |
| ren-ta'an | the voice room "heard company" | | dumai | bruise |
| shuu | wind | | dorvi | eventually |
| selai | polite | | khethu | annoying |
| shimu | embarrassed | | kopu | copper |
| shavu | lucky | | taru | stubborn |
| polu | to float | | | |

## Names that mean something

Most names are just names. These are the few a player can crack into words:

- **Vael** (Oruun's line): "finder."
- **Yulen**: from *yul*, "one who knows."
- **Ormaa**: from *orm*, "the steady one."
- **Tharvend**: "keeper of the count."
- **Naa'shenai**: "the far, together."
- **Ilumaar**: "the lit many."
- **Nul'ir**: "the empty shore."
- **Makaal**: "the unmaking."

## Names in the archive

Proper names the translation keeps in their own form, beyond the roster,
the galaxies and the names above. The validator reads this list.

- **Ormaa** — the star that powers the hall
- **Tovaa** — the Yulenai settlement
- **Hesk** — the Paaruk yards' star
- **Ennal** — the Senwe survey ship
- **Kesh** — Hethra's hull, the ninth
- **Tannar, Voe** — Tannar Voe, of the Paaruk yards
- **Pohru, Denn** — Pohru Denn, whose partner flies the fourth hull
- **Rulen, Haaw** — Rulen Haaw, of the Senwe survey
- **Esko, Lirai** — Esko Lirai, of the outer survey
- **Pellu, Eth** — Pellu Eth, of Orru
- **Ahriel** — Ahriel Tovaa, the settlement's shared keystone
- **Hiraal, Ok** — Hiraal Ok, keeper of the Old Glass
- **Shuunu, Paal** — Shuunu Paal, of the relay hall
- **Thovi, Rennet** — Thovi Rennet, of the fold school
- **Tenn** — Tenn Vael, Oruun's partner
- **Taam, Sethe, Lirru, Keel** — Theruun students; Lirru Keel lent Paelu her notes
- **Oskel** — Oskel Kaari, who built hull nine
- **Temmet, Aal** — Temmet Aal, Morai Lenn's grandmother
- **Anvaar, Tethi** — Anvaar Ilaar and Tethi Dar, who signed the charter
- **Tolun, Ves, Haami, Ork, Sennu, Daal, Ilvaar, Teth, Ormen, Ush, Doveth, Kaal, Lethu, Sarr** — members of the Assembly, heard in the vote's recording (voice.md)
- **Doru** — a cargo pilot nobody has met
- **Orru** — a Yulenai settlement with no instrument
- **Oma, Varrek** — Oma Varrek, the Paaruk yard-master lifting Hesk
- **Esa** — Beginning, the seeded Senwe world (it is the word "begin")
- **Ris, Maru, Aanu** — Paelu's sibling and parents
- **Hesh, Anvaar** — Hesh Anvaar, the digest's curator before Oruun
- **Dannar, Weth** — Dannar Weth, the Speaker of the Assembly
- **Veshal** — an Oshkaa line
- **Sael, Ormun** — Sael Ormun, an indexer entered into the count
- **Kethel, Aan** — Kethel Aan, the astronomer a star is named for
