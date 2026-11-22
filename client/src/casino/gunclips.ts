// THE GUN, AS ANIMATION — which locomotion clip a body plays with a pistol in
// its hand (Josh's Mixamo set, assets/Models/gun). The drunkclips shape, for
// the drunkclips reason: three bodies read this table — your first-person rig,
// your stand-in, every peer — plus world.ts building its load list off it.
//
// PRECEDENCE: drunk beats armed. gunState() only maps SOBER locomotion names,
// so a body that drunkState() already swapped keeps its stagger — a drunk with
// a gun staggers with a gun in his hand, which is both funnier and honest
// about which state owns the whole body.

/** Sober state → its armed twin. ABSENT stays unarmed on purpose: Josh's set
 *  covers walk/run fwd+back and the jump — strafes, crouches and the rest
 *  keep the clips whose feet match the direction of travel (the drunkclips
 *  doctrine). The set's "Pistol Strafe" file is wired as the RIGHT strafe —
 *  measured in-engine, not assumed (see GUN_CLIPS). */
export const GUN_OF: Record<string, string> = {
  walk: "gunwalk",
  walkback: "gunwalkback",
  walkright: "gunwalkright",
  run: "gunrun",
  runback: "gunrunback",
  jump: "gunjump",
};

/** Every armed state: the clip FILE it wants and the sober state it falls back
 *  through if the file is missing — a lost download costs the pistol arm pose,
 *  never a T-pose. */
export const GUN_CLIPS: Record<string, { file: string; sober: string }> = {
  gunwalk: { file: "gun-walking", sober: "walk" },
  gunwalkback: { file: "gun-walking-back", sober: "walkback" },
  gunwalkright: { file: "gun-strafe", sober: "walkright" },
  gunrun: { file: "gun-running", sober: "run" },
  gunrunback: { file: "gun-running-back", sober: "runback" },
  gunjump: { file: "gun-jump", sober: "jump" },
};

/** Swap a locomotion state for its armed twin. Pure and table-driven so the
 *  harness can read it without a rig. */
export function gunState(state: string, armed: boolean): string {
  if (!armed) return state;
  return GUN_OF[state] ?? state;
}

/** How long a shot body lies there before it walks back in at the entrance.
 *  MIRRORS the server's GUN_RESPAWN_MS (src/casino/items.ts) — the server's
 *  copy is the authority (it gates re-shooting a corpse); this one only times
 *  the victim's own countdown overlay. */
export const GUN_RESPAWN_MS = 10_000;

/** Minimum ms between trigger pulls — MIRRORS the server's SHOT_MIN_MS
 *  (src/casino/items.ts), which is the authority. The client enforcing it too
 *  is what keeps the HUD honest: without it a fast finger played the whole
 *  fire show (flash, bang, predicted decrement) on clicks the server was
 *  refusing, so the count on screen ran ahead of the rounds actually spent —
 *  Josh both "fired more than 9" (cosmetic-only shots) and stored an "empty"
 *  gun that still held two real rounds. */
export const FIRE_MIN_MS = 320;

/** Ragdoll launch speed for a gunshot, cells/second. The stage death's
 *  THROW_POWER is 4.2 — measured as the hardest throw that stays inside the
 *  hall's geometry when launched off a raised stage. A shot body launches LOW
 *  (it was standing on the carpet, not a platform) and the sim collides with
 *  the walls and floor regardless, so "very intensely" (Josh) gets real
 *  headroom over the stage number. */
export const GUN_THROW_POWER = 6.0;
/** How far downrange a shot body is aimed to come to rest, cells. */
export const GUN_THROW_REACH = 4.5;
