// SOLACE SURVIVORZ — WHERE THE TWO BODIES OF A FINISHER STAND. Each attack in the Brutal
// Zombie Finisher pack is two clips with the same name: the zombie's (on the zombie) and the
// survivor's reaction (on the survivor). They only line up when the survivor stands where the
// pack put them, relative to the zombie. The pack's notes gave the front and downed placements;
// the back and ceiling ones were found by eye (Oct 21 2026, pair sheets on zombie-m01 + Eric).
// Metres, degrees; the zombie at the origin facing +Z.
//   bx, bz   the survivor's position      byaw  the survivor's turn
//   ayaw     the zombie's turn            ay    the zombie's height (a ceiling ambush hangs)
export const PAIR_PLACE = [
  // REFINED ON OUR BODIES (Oct 23 2026): the pack was made on a slimmer mannequin, and at its own
  // placements most pairs sank 5-18 cm into each other on ours (zombie-m01 on Eric, the sixth-deepest
  // skin vertex). Each placement below is the pack's refined on a grid round it (±20 cm, ±30 cm, ±10°),
  // scored on that overlap with the zombie's hands still made to reach the survivor (scratchpad
  // fzrefine2/fzchain). Clips that play back to back as one struggle share ONE placement — the
  // survivor can't slide between them — chosen on the worst of the chain. The pack's own guesses were
  // front {0, 1.5, 180} and back {0, 1.5, 0}.
  [/^fz-front-struggle/, { bx: 0.05, bz: 1.7, byaw: 180, ayaw: 0, ay: 0 }],   // the chain: worst 12.1 -> 6.6 cm
  [/^fz-back-struggle/, { bx: 0.1, bz: 1.5, byaw: 0, ayaw: 0, ay: 0 }],        // the chain: worst 7.6 -> 5.9 cm
  [/^fz-front-fall-v2$/, { bx: 0.15, bz: 1.5, byaw: 190, ayaw: 0, ay: 0 }],    // 11.0 -> 0.5
  [/^fz-front-fall$/, { bx: -0.2, bz: 1.75, byaw: 170, ayaw: 0, ay: 0 }],      // 9.9 -> 2.4
  [/^fz-front-jump-tear-up$/, { bx: 0, bz: 1.55, byaw: 175, ayaw: 0, ay: 0 }], // 5.4 -> 0
  [/^fz-front-jump-v2$/, { bx: -0.1, bz: 1.6, byaw: 170, ayaw: 0, ay: 0 }],    // 8.1 -> 0
  [/^fz-front-jump$/, { bx: -0.05, bz: 1.65, byaw: 170, ayaw: 0, ay: 0 }],     // 16.8 -> 0
  [/^fz-front-stand-v2$/, { bx: 0.05, bz: 1.5, byaw: 180, ayaw: 0, ay: 0 }],   // 12.3 -> 1.7
  [/^fz-front-stand$/, { bx: -0.2, bz: 1.6, byaw: 170, ayaw: 0, ay: 0 }],      // 7.3 -> 1.1
  [/^fz-front/, { bx: 0, bz: 1.5, byaw: 180, ayaw: 0, ay: 0 }],    // pack: React Z 150, Y 180
  [/^fz-back-v2$/, { bx: 0.05, bz: 1.65, byaw: 10, ayaw: 0, ay: 0 }],          // 14.0 -> 5.7
  [/^fz-back$/, { bx: -0.15, bz: 1.55, byaw: 10, ayaw: 0, ay: 0 }],            // 5.9 -> 1.9
  [/^fz-back/, { bx: 0, bz: 1.5, byaw: 0, ayaw: 0, ay: 0 }],       // grabbed from behind: facing away
  // THE LYING FAMILY, SOLVED: the pack's "React Z 50, Y 90" read as a placement put the two bodies apart
  // for the whole clip (overlap 0 at every frame, the crawler's hands 70-90 cm off the ankle, its head
  // over a metre past the survivor's at the end). Solved from the contacts instead — the hand on an ankle
  // at the grab, the head at the neck at the end (scratchpad fzsolve) — then refined as above: the
  // survivor about a metre in front of the crawler, facing it, or walking away for the grab from behind
  [/^fz-lying-leg-back/, { bx: -0.2, bz: 1.1, byaw: 10, ayaw: 0, ay: 0 }],     // 10.3 -> 8.7 (the floor)
  [/^fz-lying-leg/, { bx: -0.05, bz: 1.1, byaw: 180, ayaw: 0, ay: 0 }],        // 5.5 -> 2.7
  [/^fz-lying/, { bx: -0.2, bz: 0.85, byaw: 190, ayaw: 0, ay: 0 }],            // (the contact solve: the overlap refine put him standing over the crawler, which only the fit can resolve)
  // the ceiling ambush: the zombie hangs from above
  [/^fz-up-down-v3$/, { bx: 0, bz: 0, byaw: 0, ayaw: 0, ay: 0 }],              // (not a ceiling ambush: the SURVIVOR drops head-first onto the zombie)
  [/^fz-up-down-v2$/, { bx: 0, bz: 0.5, byaw: 175, ayaw: 0, ay: 0.6 }],        // 13.4 -> 3.8
  [/^fz-up-down$/, { bx: -0.2, bz: 0.8, byaw: 190, ayaw: 0, ay: 0.6 }],        // 18.1 -> 5.4
  [/^fz-up-down/, { bx: 0, bz: 0.6, byaw: 180, ayaw: 0, ay: 0.6 }], // hanging from above
];
export const placeOf = (id) => PAIR_PLACE.find(([re]) => re.test(id))?.[1] ?? { bx: 0, bz: 1.5, byaw: 180, ayaw: 0, ay: 0 };

// DUOS: two survivors, a different clip on each, fitted to that pair (scripts/survivorz/
// anim-recipes.js, baked by anim-build.cjs --hug). The hug: A puts its arms over B's shoulders,
// B round A's back; they stand the measured gap apart (out/hug-gaps.json), facing each other.
// THE HUG'S ROLES GO BY SHOULDER HEIGHT: arms go OVER the shoulders of the one whose shoulders are
// lower (a lower pair of shoulders reaching over higher ones is the one combination the natural
// check rejects). Shoulder heights standing (m, the idle), measured Oct 22 2026.
export const SHOULDER = { nathan: 1.489, eric: 1.468, rollo: 1.468, manuel: 1.438, claudia: 1.417, sophia: 1.367, carla: 1.36 };   // (Rollo is Eric's rig)
export const DUOS = [
  { name: "bd-hug", pick: (a, b, gaps) => (SHOULDER[a] ?? 0) >= (SHOULDER[b] ?? 0)
    ? { aname: `bd-hug-over-${b}`, bname: `bd-hug-under-${a}`, bx: 0, bz: gaps?.[a]?.[b], byaw: 180, ayaw: 0, ay: 0 }
    : { aname: `bd-hug-under-${b}`, bname: `bd-hug-over-${a}`, bx: 0, bz: gaps?.[a]?.[b], byaw: 180, ayaw: 0, ay: 0 } },
];
// THE OTHER PAIR MOVES (Oct 23 2026). Each is A's move on B, baked per pair; where B stands rides A's
// clip as `built`: `gap` (B straight ahead, facing A) or `place` ({x, z, yaw}, A at the origin facing
// +Z, B turned yaw degrees). B plays the clip named here.
//   bd-comfort-<B>        B plays bd-comforted,       at built.gap
//   bd-kiss-a-<B>         B plays bd-kiss-b-<A>,      at built.gap (the TALLER of the two plays kiss-a: arms round the back)
//   bd-revive-<B>         B plays mx-receiving-cpr,   at built.place (CPR, then the rescue breaths)
//   bd-mercy-<B>          B plays mx-sitting-idle,    at built.place (A's shot after: gp-ual1-pistol-shoot, same place)
//   bd-bandage-other-<B>  B plays mx-sitting-idle,    at built.place
export const PAIR_MOVES = [
  { move: "comfort", b: () => "bd-comforted", at: "gap" },
  { move: "kiss-a", b: (a) => `bd-kiss-b-${a}`, at: "gap", tallerIsA: true },
  { move: "revive", b: () => "mx-receiving-cpr", at: "place" },
  { move: "mercy", b: () => "mx-sitting-idle", at: "place" },
  { move: "bandage-other", b: () => "mx-sitting-idle", at: "place" },
];

// THE SUIT ALLOWANCE (Josh's call, Oct 24 2026): Rollo's hazmat suit is padding, and padding squashes where
// a hand or an arm presses it — so a pair with Rollo in it is judged 3 cm further in (6 cm, not 3). Past that
// is still a clip. anim-clip.cjs carries the same allowance for his own body
export const SUIT_ALLOW = { rollo: 0.03 };
export const pairLine = (a, b) => 0.03 + Math.max(SUIT_ALLOW[a] ?? 0, SUIT_ALLOW[b] ?? 0);
