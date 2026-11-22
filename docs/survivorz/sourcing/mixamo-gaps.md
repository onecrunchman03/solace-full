# Survivorz — moves still to download from Mixamo

**Every move on this list is now covered (Oct 21 2026).**

The plan's list of moves the show needs (ASSETS.md §2e), checked against the 235 survivor and
84 zombie clips we have on Oct 21 2026. Josh downloads these himself at his PC (Mixamo login
is his). **Download settings, the same as last time:** FBX for Unity, 30 fps, **without skin**,
"In Place" ticked where Mixamo offers it. Put them in `assets/New Assets/` and say so; the
intake converts and bakes them onto every body.

Search Mixamo for the term in the middle column and take the closest one or two.

| Move the show needs | Search Mixamo for | Have something close already? |
|---|---|---|
| Hammering planks onto a doorway | `hammering`; not on Mixamo | **BUILT IN CODE Oct 21** (`bd-hammer`) |
| Working at a standing workbench | `working on device`, `fixing` | covered: Searching Files High (hands busy at a high shelf) |
| Opening a heavy door / pushing one | `opening door`, `pushing` | **DONE Oct 21: Door Opening + Door Closing** |
| Kicking a door in | `kick door`, `front kick` | **DONE Oct 21: Door Kick + Kicking** |
| A jump-scare flinch | `startled`, `flinch`, `scared` | **DONE Oct 21: Startle 1 + 2** |
| Sitting on the floor against a wall | `sitting on ground`, `sitting idle floor` | **DONE Oct 21: Sitting Idle (on the floor)** |
| Getting into and out of a bed | `lying down`, `getting up from bed` | **DONE Oct 21: Lying Down (onto a safe-room bed)** |
| Crying | `crying` | **DONE Oct 21: Crying** |
| A hug | `hug`; not on Mixamo | **BUILT IN CODE Oct 21** (`bd-hug`, a pair: one arms over, one round the back) |
| Kneeling over a body | `kneeling`, `kneel idle` | **DONE Oct 21: Kneeling Down + Kneel To Standup** |
| Coughing fits standing up | `coughing`; not on Mixamo | **BUILT IN CODE Oct 21** (`bd-cough`) |
| Losing it / maximum fear | (found by Josh) | **DONE Oct 21: Agony** |
| Shivering | `cold`, `shiver`; not on Mixamo | **BUILT IN CODE Oct 21** (`bd-shiver`) |
| A stagger | `stagger`; not found Oct 21 — try `stumble backwards`, `drunk`, `hit and stumble` | **DONE Oct 21: Stumble Backwards (falls on its back)** |
| Climbing a ladder | `climbing ladder` | **DONE Oct 21: Climbing Ladder + Climbing To Top (float by design: a ladder holds them up)** |
| Crawling through a vent | `crawling`, `crawl`; not on Mixamo | covered: Injured Crawling |
| Bandaging a wound | `bandage`, `treating`; not on Mixamo | **BUILT IN CODE Oct 21** (`bd-bandage`, sitting) |

**Built in code (`scripts/survivorz/anim-recipes.js` -> `anim-build.cjs <body>`):** the five
above, then THE TOOLS ROUND (Oct 21): flashlight walk + run, injecting, opening a can, keypad,
keycard, the shotgun's pump and shell loading (on the real shotgun from the pack), crowbar
prying, holding a door shut, dragging a body, the look back over a sprint, lighting a molotov.
All built; Josh's flags on the first pass (can, crowbar, injection, molotov) rebuilt. Every
built move is held to THE ANIMATION LAWS (SURVIVORZ.md §10) in the bake itself.

**The paired moves are covered by the finisher pack** (27 attacks: front, back, the two
struggles with their escape, a downed survivor, the ceiling ambush). Still not in any library:
**pulling a zombie off an ally** and **a survivor turning into a zombie** (the plan builds the
turning from clips: the coughing fit, a collapse, the zombie stand-up).
