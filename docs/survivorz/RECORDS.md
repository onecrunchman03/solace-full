# SURVIVORZ — THE RECORDS

Every record a survivor can find in Halcyon Site 9: where it is, what it
takes to read, what it unlocks, and its full text. Josh handed the writing
over on 2026-10-23 ("make sure its interesting and has those resident evil
vibes"). The spine is in `LORE.md`; the rules for records are SURVIVORZ.md §2
("The records").

**How to read the table at the top of each record:**
- **Where:** the room id in `src/survivorz/facility-map.ts`, and the spot (an
  existing terminal spot, or a new paper spot to add to the map).
- **Kind:** terminal, paper, or audio (a recording, played aloud; the script is
  in `audio-logs.mjs`).
- **Lock:** what it takes to read: Electronics N, or a password found in
  another record.
- **Part of:** TRUTH n (one of the 12), LAZARUS n (one of the 5), CODE (it holds
  a code or password), CACHE (it points at hidden supplies), CLAUDIA (it gives
  her away), or nothing (it's colour).

Dates: the release at Cedar Ridge is **April 2**; Atlanta falls by **May 1**;
Site 9 is sealed on **May 3**; the survivors arrive in **August**.

## THE PASSWORDS AND CODES

| Opens | The answer | Where the clue is |
|---|---|---|
| Reyes's office terminal (Electronics 3) | `LUCY2009` | R-08, the photo on his desk |
| Marsh's office terminal (Electronics 5) | `SOUTHERNGRACE` | R-12, Claudia's sticky note, plus R-11, the boat photo |
| Control room terminal (Electronics 5) | `VICTOR1` | R-24, Delaney's note |
| Observation deck terminal (Electronics 7) | `TALLOW-9` | R-13, the product sheet |
| Weapons locker in the armoury | `0412` | R-21, Kane's duty report |
| The morgue's cold drawer (antivirals) | `1917` | R-19, the ward chart |
| Delaney's padlocked toolbox behind the boiler (food) | `451` | A-09, Delaney's voice memo |

A group with no Electronics can still read every locked record, by finding
its password.

---

## VAULT LOBBY

### R-01 · Welcome to Site 9 · TRUTH 1
Where: `reception` (paper: the bronze plaque by the doors) · Kind: paper · Lock: none

> **HALCYON BIOLOGICS — SITE 9**
> *Countermeasures for a Safer Tomorrow*
>
> Established under contract with the Department of Health Security for the
> study of emerging pathogens and the development of rapid countermeasures.
> Site 9 is a Level 4 containment facility. Every person who passes these
> doors is part of a promise: that when the next pandemic comes, America will
> already have the answer.
>
> *Dedicated in the memory of those we could not save.*

### R-02 · Visitor log, last page
Where: `reception` (`reception-terminal`) · Kind: terminal · Lock: none

> VISITOR LOG — SITE 9 RECEPTION
>
> 04/01 08:12 — A. ASHBY — ANVIL HOLDINGS — host: E. MARSH — badge V-17 — *exit not recorded*
> 04/01 08:40 — J. OKONJO — DHS AUDIT — host: E. MARSH — audit postponed by host
> 04/02 05:55 — "WATER AUTHORITY" ×2 — host: G. DELANEY — badge V-18, V-19
> 05/02 23:47 — NO VISITORS. SITE IN LOCKDOWN.
> 05/03 00:00 — RECEPTION SYSTEM SUSPENDED BY DIRECTOR ORDER.

### R-03 · Security desk shift note
Where: `security-desk` (paper, taped to the desk) · Kind: paper · Lock: none

> Whoever's on nights —
> The vault does NOT open from this side without the override, so quit
> calling Control every time somebody bangs on it. It's the dead. They don't
> stop. Turn the radio up.
> Keycard's in the drawer if Medical calls for a runner. Bring it BACK.
> — T.

---

## RESIDENTIAL WING

### R-04 · Canteen menu, week of April 6
Where: `canteen` (paper, on the board) · Kind: paper · Lock: none

> MONDAY — Meatloaf / Mashed potatoes / Peach cobbler
> TUESDAY — Taco Tuesday!! (Gus is NOT allowed near the hot sauce again)
> WEDNESDAY — Chicken & dumplings
> THURSDAY — ~~Fish fry~~ CANCELLED — supply truck did not arrive
> FRIDAY — ~~Pizza~~ CANCELLED — supply truck did not arrive
> SATURDAY — Whatever's left
>
> *Kitchen staff: we are on reserve stock. Do NOT open the deep freezer
> without a manager. — mgmt*

### R-05 · Happy birthday, Hannah!
Where: `bunks-b` (`bunks-b-tablet`) · Kind: terminal · Lock: none

> From: Tomas Ruiz (Security)
> To: Site 9 — All Staff
> Date: March 28
> Subject: 🎂 cake in the rec room at 4
>
> It's Dr. Cole's birthday and she told me not to make a big deal of it,
> so naturally there is a very large cake. Chocolate. Rec room at four.
> If Gus eats the corner pieces before everyone gets there again I am
> filing a formal incident report.
>
> > Reply — Hannah Cole: Tomas I am going to kill you. Thank you. ♥

### R-06 · A letter in a locker
Where: `bunks-a` (paper, in a locker) · Kind: paper · Lock: none

> Dear Mom,
> I can't tell you where I am, which you hate, I know. But it's a good job
> and they pay us like we're astronauts. I'm saving it. When this contract's
> over I'm coming home and fixing your porch myself.
> Something's going on this week. People are walking fast in the halls. The
> Director hasn't come out of her office in two days. The guys say it's an
> audit. I don't think it's an audit.
> I'll call Sunday.
> Love you. — Danny
>
> *(the envelope is stamped, addressed to Macon, never sent)*

### R-07 · Resignation, not sent
Where: `rec-room` (paper, folded inside a paperback) · Kind: paper · Lock: none

> Dr. Marsh,
> I am resigning from Site 9 effective immediately. I signed on to build
> countermeasures. I did not sign on to build what I saw on the Containment
> board on Tuesday, and I will not be told it is "a defensive model." I
> know what a dispersal curve is.
> I'm aware of my confidentiality agreement. I'm aware of what it says will
> happen to me. Do it anyway.
> — R. Albrecht, Lab Tech II
>
> *(it was never handed in; the paperback is "The Count of Monte Cristo")*

---

## RESEARCH LABS

### R-08 · A photo on Dr. Reyes's desk · CODE
Where: `glass-offices` (paper: a framed photo by `office-terminal-1`) · Kind: paper · Lock: none

> *A crayon drawing of a man in a white coat holding hands with a small girl
> under a yellow sun. Written across the top in a child's hand:*
>
> TO DADDY — LOVE LUCY — AGE 7 — 2016
>
> *Stuck to the frame, a yellow sticky note in an adult's hand:*
> "pw hint: my girl + the year she arrived. (stop locking yourself out, Sam)"

### R-09 · Funding memo · TRUTH 2
Where: `glass-offices` (`office-terminal-1`, Dr. Reyes) · Kind: terminal · Lock: Electronics 3, or `LUCY2009`

> HALCYON BIOLOGICS — FINANCE — RESTRICTED
> To: S. Reyes, Principal Investigator
> Re: Program 9 funding structure
>
> Sam — you asked where the money is coming from. Short version: not
> Washington. The DHS contract covers about 4% of Site 9's operating budget.
> It's a door, not a wallet.
>
> The remaining 96% comes from Anvil Holdings, via three intermediaries I'd
> rather not put in an email. Anvil doesn't want its name on anything and
> you will not see it on anything. The paperwork will carry their mark only.
>
> *(a small seal is embedded in the memo's footer: an anvil inside a ring of
> stars)*
>
> Please don't ask me again. Some questions cost more than the answers are
> worth. — K. Lindqvist, Finance

**Rollo knows that seal.** Anything he says on reading it, he says once and
nobody believes him.

### R-10 · Reyes, recorded log #31 · TRUTH 3 · audio A-01
Where: `clean-lab-a` (`lab-a-terminal`) · Kind: audio · Lock: none (the lab needs power)

Script in `audio-logs.mjs` (A-01). What it says: G-Strain was never a
countermeasure. Reyes built it to a specification: high transmission, near
total mortality, rapid onset, and "the hosts stay mobile — they disperse it
themselves." Then a kill-switch protein "for safety", one the client wouldn't
fund. *"I keep telling myself somebody would have built it. That's not the
same as it being me."*

### R-11 · The Director's boat · CODE
Where: `glass-offices` (paper: a framed photo on Marsh's desk) · Kind: paper · Lock: none

> *A white sailboat on a grey lake, a woman at the tiller, laughing. The name
> on the stern in blue letters:* SOUTHERN GRACE.
> *On the back, in pen:* "Lanier, July. The only place nobody can call me. — E."

### R-12 · Claudia's sticky note · CODE · CLAUDIA
Where: `glass-offices` (paper: stuck under Marsh's keyboard) · Kind: paper · Lock: none

> Dr. M — IT reset your login AGAIN. I set it back to the boat, no spaces,
> all caps, like always. PLEASE stop writing it down. ♥ — C.

### R-13 · TALLOW — product summary · TRUTH 4 · CODE
Where: `glass-offices` (`office-terminal-2`, Dr. Marsh) · Kind: terminal · Lock: Electronics 5, or `SOUTHERNGRACE`

> ANVIL HOLDINGS — PRODUCT SUMMARY — DO NOT PRINT
> Designation: **TALLOW** (G-Strain, mature build)
>
> TALLOW is a self-propagating agent for the **removal of a population with
> no loss of infrastructure.** Buildings, power, roads, water treatment and
> stored goods remain intact and immediately usable. Hosts remain mobile for
> an extended period and carry the agent outward without further
> intervention.
>
> Interested parties: three (designated BUYER-1, BUYER-2, BUYER-3).
> Price on acceptance of a successful demonstration.
>
> Containment systems access phrase for authorised staff: **TALLOW-9**
>
> Known limitation: none disclosed to buyers.

### R-14 · Marsh to Ashby, March 19 · TRUTH 5
Where: `glass-offices` (`office-terminal-2`) · Kind: terminal · Lock: as R-13

> From: E. Marsh
> To: A. Ashby
> Subject: Re: Re: demonstration
>
> Mr. Ashby,
> I understand the buyers' position, but a field demonstration was never
> part of Site 9's mandate. Our containment models are excellent. Our
> containment models are also models.
>
> If the board insists, I need it in writing: a small population, a hard
> quarantine line held by your people, and full extraction of my staff if
> the line fails.
>
> > From: A. Ashby
> > The board insists. The buyers are not interested in a terrarium, Doctor.
> > You'll have your quarantine line. Cedar Ridge has a population of 4,100
> > and one water main. Your maintenance lead has the work order.

### R-15 · Clean Lab B, the whiteboard · LAZARUS 1
Where: `clean-lab-b` (`lab-b-notes`) · Kind: paper (a whiteboard, half wiped) · Lock: none

> PROGRAM 9 — **"LAZARUS"** (S.R. / H.C. — DO NOT ERASE)
>
> The client never paid for the off-switch → it was **never finished**.
> BUT the binding site is still in the genome. Every copy carries a lock
> with no key.
> We make the key.
>
> 1. find the switch protein ✓
> 2. stable carrier ✗ — needs Deep Lab bench (power!!)
> 3. source tissue — *see Hannah*
> 4. test
>
> *(someone has written in red underneath: "IF YOU ARE READING THIS AND
> WE ARE GONE — FINISH IT")*

---

## MEDICAL & QUARANTINE

### R-16 · Hannah Cole's diary · LAZARUS 2 · CODE
Where: `quarantine` (paper: a notebook in cell 3) · Kind: paper · Lock: none

> **April 9.** Sam won't say what the Cedar Ridge "exercise" was. He hasn't
> slept. I found him in Lab B at 3am talking to the whiteboard.
>
> **April 14.** I know now. God. I know now.
>
> **April 15.** We are going to fix it. The switch only reads in the
> ORIGINAL build. The Cedar Ridge strain changed in the water: it's not the
> same lock any more. So the key has to be made from first-generation tissue:
> a Containment subject, not one of the ones from outside. Somebody will
> have to go down there.
>
> **April 30.** They're in the city. Sam's terminal password is still Lucy's
> name + her year. If I don't make it, somebody tell Lucy her dad tried.
>
> **May 3.** Locked in. Marsh says it's procedure. It isn't.
>
> **May 4.** I put myself in cell 3. Scratch on my wrist from the subject
> transfer. Probably nothing. Locking the door from the inside so I don't have
> to trust anybody's judgment about that, including mine.
>
> **May 6.** It wasn't nothing.

### R-17 · Cole, recorded · audio A-08
Where: `quarantine` (`quarantine-terminal`) · Kind: audio · Lock: none

Script in `audio-logs.mjs` (A-08): her last recording from cell 3, the fever
coming on, calm and frightened, telling whoever finds it where the Lazarus
notes are and that she's sorry about the door.

### R-18 · Reyes, recorded log #44 · TRUTH 9 · audio A-03
Where: `quarantine` (`quarantine-terminal`) · Kind: audio · Lock: none

Script in `audio-logs.mjs` (A-03): Cedar Ridge, day six. The quarantine line
held for four days. Then reports of bites, then of "the deceased returning to
the clinic." The strain changed in the water. *"The models said nine days and
done. It's not doing what I built it to do. It's doing better."* The line is
gone. *"It got away."*

### R-19 · Ward chart, bed 4 · CODE · CACHE
Where: `ward` (`ward-chart`) · Kind: terminal · Lock: none

> PATIENT: (redacted) — BED 4 — Dr. Okafor attending
> Status: deceased 04/28, 03:10. Body to morgue drawer 7.
>
> Note to Dr. Patel: I've put the last of the antivirals in the morgue's cold
> drawer. Nobody's going to look for medicine in a morgue, and with the way
> people are looking at that supply cabinet, I'd rather nobody did. Same code
> as the year on the plaque in your office. Don't make me regret this.
> — A.O.
>
> *(the plaque in Dr. Patel's office, mentioned nowhere else: "Founded 1917 —
> St. Augustine's Hospital, Savannah". The code is 1917.)*

### R-20 · Morgue terminal
Where: `morgue` (`morgue-terminal`) · Kind: terminal · Lock: none

> MORGUE — DRAWER STATUS
> 1 — OCCUPIED · 2 — OCCUPIED · 3 — OCCUPIED · 4 — OCCUPIED
> 5 — OCCUPIED · 6 — OCCUPIED · 7 — ~~OCCUPIED~~ **EMPTY 04/29 04:02**
> 8 — LOCKED (keypad) — temperature 4°C
>
> SYSTEM NOTE: drawer 7 reports opened from the INSIDE.

---

## SECURITY

### R-21 · Kane, duty report · CODE
Where: `security-desk` (paper: a clipboard on the wall) · Kind: paper · Lock: none

> DUTY REPORT — V. KANE, HEAD OF SECURITY — APRIL 1
> - Weapons locker in the armoury re-coded. New code is the anniversary.
>   Same as last year. Ruiz, yes, I know you know it. Don't write it down.
> - V-17 (Ashby) to be escorted at all times. He's not to touch anything.
>   He touched everything.
> - 2 vehicles signed out to Delaney for "water authority" work 04/02,
>   05:30. Escort: me. Paperwork: Director's office.
>
> *(pinned beside it: a wedding photo, "Victor & Rosa — 4.12.2001")*

**The code is 0412.**

### R-22 · Kane, recorded · TRUTH 7 · audio A-02
Where: `camera-room` (`camera-terminal`) · Kind: audio · Lock: none

Script in `audio-logs.mjs` (A-02): Kane, the night of April 2, still in the
truck. He drove "water authority" men to the Cedar Ridge pumping station at
dawn, watched them open a valve housing with a Halcyon cold case. Nobody
told him what was in it. He's been head of security for eleven years and
he's starting to wonder what, exactly, he's been securing.

### R-23 · Camera room, overnight log · CLAUDIA
Where: `camera-room` (`camera-terminal`, the log beside the recording) · Kind: terminal · Lock: none

> CAMERA SYSTEM — EVENT LOG (AUTO)
> 08/09 03:11 — CAM 01 (VAULT CHAMBER): MOTION
> 08/09 03:12 — VAULT OVERRIDE ENGAGED — **BADGE: C. PRICE**
> 08/09 03:13 — VAULT DOOR OPEN
> 08/09 03:19 — CAM 01: MOTION (OUTBOUND)
> 08/09 03:26 — CAM 01: MOTION (INBOUND)
> 08/09 03:27 — CAM 14 (REC ROOM): MOTION
> 08/09 03:27 — PANIC ROOM DOOR — CYCLED
> 08/12 — 08/14: PANIC ROOM DOOR — CYCLED ×11
>
> SYSTEM NOTE: vault door has remained open 4 days. Override cannot re-seal
> without operator.

*(The survivors came in on 08/13 and shut the vault behind them. This log is how anyone works out that somebody else is still here.)*

### R-24 · Delaney's sticky note · CODE
Where: `control-room` (paper: stuck to the console) · Kind: paper · Lock: none

> Control login is STILL "KANE" / "VICTOR1."
> Eleven years. The man has never once changed it.
> If I'm ever Head of Security I'm changing it to "VICTOR1" too, out of respect.
> — G.D.

### R-25 · Ashby to Marsh, April 30 · TRUTH 10
Where: `control-room` (`control-terminal`) · Kind: terminal · Lock: Electronics 5, or `VICTOR1`

> From: A. Ashby
> To: E. Marsh
> Subject: Re: EXTRACTION — URGENT
>
> Doctor,
> The buyers are very pleased with the demonstration. All three have
> accepted. I'm told the bidding was spirited.
>
> I've read your request. Extraction was conditional on the quarantine line
> failing *by your people's error*. It failed by the product's design, which
> is to say it succeeded. There's no clause for that.
>
> Site 9 will be sealed at midnight on the 2nd. Please don't make the
> decommission more unpleasant than it has to be.
> — A.

### R-26 · Ashby, a recorded call · TRUTH 10 · audio A-04
Where: `control-room` (`control-terminal`, an attached call recording) · Kind: audio · Lock: as R-25

Script in `audio-logs.mjs` (A-04): Marsh's line, recorded by the Site's
system on May 2. Only Ashby is heard clearly: pleasant, patient, explaining
that Site 9 is "an asset that has completed its purpose", that nobody is
coming, and thanking her, sincerely, for her work.

### R-27 · Kane, last recording · TRUTH 11 · audio A-05
Where: `control-room` (`control-terminal`) · Kind: audio · Lock: none

Script in `audio-logs.mjs` (A-05): May 3, past midnight. The doors locked
themselves on a remote order. The vault's been sealed from outside. He's been
bitten, putting a subject back in its cell. He's taking keycard 3 with him so
nobody gets into the armoury in a panic. He knows what he'll be by morning.
*"If you're hearing this, and you need the card — you'll have to take it off
me. Don't hesitate. I'd have done it for you."*

### R-28 · The armoury inventory
Where: `armoury` (paper: a clipboard) · Kind: paper · Lock: none

> ARMOURY — INVENTORY 05/02 (V.K.)
> Sidearms: 12 issued, 3 remain (locker)
> Long arms: 6 issued, 1 remains (locker)
> Shotgun: 1 (locker) · shells: one box
> Rounds: ⚠ LOW. Do not issue without my say-so.
>
> If you're taking from here and you're not one of mine: count your shots.

---

## POWER & MAINTENANCE

### R-29 · Work order 0402-W · TRUTH 6
Where: `generator-hall` (`generator-log`) · Kind: terminal · Lock: none

> HALCYON BIOLOGICS — FACILITIES — WORK ORDER 0402-W
> Requested by: OFFICE OF THE DIRECTOR
> Assigned: G. Delaney
> Task: Access municipal water main, **Cedar Ridge pumping station**, valve
> housing 3. Install sampling port. Two (2) technicians from Site to attend
> (badges V-18, V-19). Security escort: V. Kane.
> Materials: one (1) cold case, sealed, **NOT TO BE OPENED BY FACILITIES.**
> Status: COMPLETED 04/02 06:40.
>
> *Delaney's note in the comments field:* "Since when do we 'sample' a city
> main by putting something IN it?"

### R-30 · The generator, a laminated card
Where: `generator-hall` (paper: on the breaker panel) · Kind: paper · Lock: none

> GENERATOR 2 — EMERGENCY OPERATION
> The emergency generator carries **THREE SECTORS AT ONCE.**
> Residential, Lobby & Maintenance are on their own battery bus.
> Choose. Throw the breaker you need, kill one you don't.
> **DO NOT RE-POWER CONTAINMENT** unless the lockdown seals are confirmed
> manual. Power to Containment releases the cell doors. You will not get
> them closed again.
> — G.D.

### R-31 · Delaney, voice memo · CACHE · CODE · audio A-09
Where: `boiler` (paper: a little dictaphone on the pipes, recording A-09) · Kind: audio · Lock: none

Script in `audio-logs.mjs` (A-09): Gus, cheerful and scared, on May 2. He's
been squirreling food behind the boiler "for the apocalypse, which my wife
said would never come, and look." The padlock on the toolbox is Fahrenheit
451, "the temperature books burn at, which is a joke, because I don't read."
He's going to try the far tunnels. *"If I'm not back for it, it's yours. Eat
the peaches first, they don't keep."*

### R-32 · Maintenance Crew safe room, a note on the lockers · CACHE
Where: `safe-power` (paper) · Kind: paper · Lock: none

> CREW — the ration locker is stocked for 6 × 10 days. That's not a challenge,
> Ricky. — mgmt

---

## SPECIMEN CONTAINMENT

### R-33 · Subject intake form · (colour)
Where: `observation` (paper: a clipboard) · Kind: paper · Lock: none

> SITE 9 — PAID VOLUNTEER PROGRAM — INTAKE
> Name: Marcus Webb · Age: 34 · Subject no.: **14**
> Compensation: **$400/week**, board and meals provided
> Program length: 6 weeks
> "Volunteer understands the program involves an investigational
> countermeasure and consents to all procedures." ✓ *(initialled: MW)*
> Notes: unhoused, no next of kin listed. **Ideal.**

### R-34 · Subject 14's notebook
Where: `specimen-cells` (paper: a notebook under a cot) · Kind: paper · Lock: none

> **Week 1.** Real bed. Three meals. They gave us STEAK. Doc Reyes is all
> right. Easiest money I ever made.
>
> **Week 3.** Shots every morning now. Arm's sore. Jenny in 12 got moved
> somewhere. They say she's fine.
>
> **Week 4.** Fever. Itchy everywhere. Can't sleep. The guards don't come
> in the cell any more, they slide the tray.
>
> **Week 5.** so hungry. ate the tray food ate the napkin. still hungry.
> Jenny's back she's in the cell across. she's looking at me. she doesn't
> blink.
>
> **wek 5** itch itch the skin comes off when i itch
>
> **wk** hungry
>
> **** smell them through the glass. warm. ***
>
> *(the last page is a single word, pressed so hard it tore the paper)*
> HUNGRY

### R-35 · Field trial plan, Cedar Ridge · TRUTH 8
Where: `observation` (`observation-terminal`) · Kind: terminal · Lock: Electronics 7, or `TALLOW-9`

> TALLOW — FIELD DEMONSTRATION PLAN — CEDAR RIDGE
> Release: municipal main, valve housing 3, 04/02 dawn.
> Expected penetration: 92% of households within 72 h.
> Expected course: onset 18–30 h; mortality 98%; mobility retained 4–6 days.
> Containment: hard line at 6 km, held by contractor (Anvil security).
> Duration: **burnout projected day 9.** No movement past the line expected.
> Cleanup: contractor team, day 12. Narrative: "chemical spill."
> Buyer observation: three viewing positions, live feed.
>
> Contingency if line fails: *(this field has been left blank)*

### R-36 · Cryo terminal
Where: `cryo-hall` (`cryo-terminal`) · Kind: terminal · Lock: none

> CRYO HALL — TANK STATUS
> TANK 1–6: SAMPLE STOCK (G-STRAIN, FIRST GENERATION) — STABLE
> TANK 7: **COLD CASE (portable)** — PRESENT — use for tissue transport
> TANK 8: EMPTY
>
> REMINDER: tissue for Program 9 must be taken FRESH (under 60 s post
> mortem) and held below 4°C. It spoils in about six hours at room
> temperature. — H.C.

---

## THE DEEP LAB

### R-37 · The Lazarus procedure · LAZARUS 3 · audio A-06
Where: `deep-lab` (`deep-terminal`) · Kind: audio · Lock: none

Script in `audio-logs.mjs` (A-06): Reyes, walking through the synthesis at
the Deep Lab bench, practical and tired. Power to the Deep Lab. Two hours at
the bench, "and it is loud, I'm sorry, the centrifuge sounds like a jet."
Three doses per batch. Prove it on the analyser before you trust it.

### R-38 · Cole, test notes · LAZARUS 4
Where: `deep-lab` (paper: a lab notebook by the analyser) · Kind: paper · Lock: none

> PROGRAM 9 — TRIAL 1 (H.C.) — 04/27
> Subject 9, infected 31 h. Lazarus batch 1, one dose.
> +2 h: fever down 1.4°.
> +5 h: lucid. Asked for water. Asked what day it was. Cried.
> +9 h: relapse. Turned at +11 h.
>
> Conclusion: the carrier is unstable in batch 1. Batch 2 must be **checked
> on the analyser** before use, every time. And it has to go in **before the
> turn**, not after.
> It nearly worked. It nearly worked. I am writing that down twice so I
> remember it was real.

### R-39 · Reyes, the last recording · LAZARUS 5 · audio A-07
Where: `clean-lab-a` (paper: a recorder in his hand; his body is in the corner) · Kind: audio · Lock: none

Script in `audio-logs.mjs` (A-07): Reyes, infected, finishing a batch-2
dose, his voice failing. *"It works if it's given before the turn. I gave it
to myself too late."* A message for Lucy that he doesn't manage to finish.

### R-40 · Report to the board · TRUTH 12 — THE FINAL FILE
Where: `deep-lab` (`final-file`, left open on the console) · Kind: terminal · Lock: none (she left it open)

> TO: THE BOARD OF ANVIL HOLDINGS
> FROM: DR. EVELYN MARSH, DIRECTOR, SITE 9
> RE: FINAL REPORT
>
> The demonstration of TALLOW was a success by every measure the buyers
> cared about. I want that on the record first, because it is the only thing
> in this report you will read.
>
> On April 2, at my order, the agent was released into the water supply of
> Cedar Ridge, Georgia, a town of 4,100 people. The quarantine line you
> promised held for four days. On day six the agent began passing by bite. By
> day twenty it was in Atlanta. I am told, by the radio, that it is now in
> every country that still has a radio.
>
> You sold it three times. You sealed this site with sixty-one of my people
> inside because we were the only ones who knew what was in the box.
>
> Dr. Reyes built a way to switch it off. You declined to pay for it. He
> finished it anyway, with Dr. Cole, in this room, while you were taking
> bids. The notes are on this console. They will die with the console unless
> someone who is not you finds them.
>
> I was not ordered to do any of it. I was asked, and I said yes, because I
> wanted the next site, and the one after that. I'm putting my name on this
> so nobody can say it was a system, or a policy, or a mistake.
>
> It was me. — E. Marsh
>
> *(the report was last saved 05/04 02:58. She is in the chair.)*

### R-41 · Staff directory · CLAUDIA
Where: `reception` (`reception-terminal`, the staff directory) · Kind: terminal · Lock: none

> SITE 9 — STAFF DIRECTORY — OFFICE OF THE DIRECTOR
> Dr. Evelyn Marsh — Site Director — ext. 900
> **Claudia Price — Executive Assistant to the Director — ext. 901**
> *(her ID photo: dark hair pinned up, a cardigan, a polite smile)*
> Keith Lindqvist — Finance — ext. 912

When Claudia is found, anyone who read this has seen her face before.

### R-42 · Marsh to Claudia, April 30 · CLAUDIA
Where: `glass-offices` (`office-terminal-2`) · Kind: terminal · Lock: as R-13

> From: E. Marsh
> To: C. Price
> Subject: (no subject)
>
> Claudia,
> Whatever happens on the 2nd, do not be at your desk. The panic room off
> the rec room has its own air and six months of food. The code is the one
> you set for me. Don't open it for anyone. Not even me.
> Thank you. For everything. I'm sorry for the rest.
> — E.

---

## Where the counts land

- **TRUTH 1–12:** R-01, R-09, R-10, R-13, R-14, R-29, R-22, R-35, R-18,
  R-25/R-26 (one record, its email and its call), R-27, R-40.
- **LAZARUS 1–5:** R-15, R-16, R-37, R-38, R-39.
- **Audio logs (9):** A-01 Reyes · A-02 Kane · A-03 Reyes · A-04 Ashby ·
  A-05 Kane · A-06 Reyes · A-07 Reyes · A-08 Cole · A-09 Delaney.
- **Claudia's giveaways:** R-12 (her note), R-23 (the override log and the
  panic room door), R-41 (her staff-directory photo), R-42 (Marsh's last email
  to her: the panic room).
- **42 records in all.**
- **New spots for the map:** every paper record above with "paper" in its
  Where line. They're added to `facility-map.ts` when the map is built.
