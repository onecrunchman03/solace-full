// SOLACE SURVIVORZ — WHAT EACH ANIMATION IS FOR, so the review groups the clips by use (Josh
// judges "is this a good stagger?", not a file name). First rule that matches wins.
// scripts/survivorz/anim-review.mjs reads this.
export const SURVIVOR_GROUPS = [
  // the guns from the pack Josh bought, fitted to the rifle set (anim-recipes.js GUNS)
  ["HK416 carbine", /^gr-/],
  ["Pump shotgun", /^gs-|^bd-shotgun/],
  ["Service pistol", /^gp-/],
  // the moves built in code with a prop in the hand (anim-recipes.js, the tools round)
  ["Tools and props (built in code)", /^bd-(flashlight|inject|can$|keypad|keycard|shotgun|crowbar|hold-door|drag-body|look-back|molotov)/],
  // the injured and pistol sets have their own walks: they go with their set, not with walking
  ["Injured and infected", /injured|laying|terrified|crawling-backwards|agony|shiver|cough|bandage/],
  ["Pistol", /pistol/],
  ["Walking, running, crouching", /walk-loop|jog|sprint|run-forward|run-left|run-right|run-backward|walk-forward|walk-left|walk-right|walk-backward|crouch|crouching|turn-90|pistol-walk|pistol-run|pistol-strafe|backwards-rifle-walk|jump|roll|climb/],
  // the rifle pack's deaths are deaths
  ["Hit, fall, get up, die", /hit|fall|knock|stunn|react|death|getting-up|laytoidle|startle|stumble/],
  ["Rifle and shotgun", /rifle|reload/],
  ["Melee and fighting", /punch|hook|uppercut|elbow|stab|melee|sword|stomp|push|throw|kick/],
  ["Using things", /cpr|carry|pick|interact|chest|consume|farm|fixing|typing|files|rummag|tree|swim|kneel|door-open|door-clos|hammer/],
  ["Standing about", /idle|sitting|yes|talk|cry|lying-down/],
];
export const ZOMBIE_GROUPS = [
  ["Walking and running", /walk|running|turn|crawl/],
  ["Attacking", /attack|bite|biting|scream|howl/],
  ["Hit, fall, get up, die", /hit|fall|knock|stunn|react|death|dying|stand-up|getting-up/],
  ["Standing about", /idle|scratch|crouch/],
];
export function groupOf(id, groups) {
  for (const [name, re] of groups) if (re.test(id)) return name;
  return "Other";
}
// a readable name for a clip id
export function labelOf(id) {
  // a gun clip is named for its move ("firing", not "firing rifle": the shotgun's ride the same set)
  if (/^g[rs]-/.test(id)) return labelOf(id.replace(/^g[rs]-/, "")).replace(/\brifle ?/g, "").trim();
  if (/^gp-/.test(id)) return labelOf(id.replace(/^gp-/, "")).replace(/\bpistol ?/g, "").trim();
  const duo = /^bd-hug-([a-z]+)-([a-z]+)$/.exec(id);
  if (duo) return `hug: ${duo[1][0].toUpperCase() + duo[1].slice(1)} over ${duo[2][0].toUpperCase() + duo[2].slice(1)}`;
  return id.replace(/^(mx|ual1|ual2|hw|bd)-/, "").replace(/^(pro-rifle-pack|pistol-handgun-locomotion-pack|male-injured-pack)--/, "").replace(/^\d\d-/, "").replace(/-loop$/, " (loop)").replace(/-/g, " ");
}
// the finisher pack's attacks, both bodies together (anim-pairs.mjs places them)
export const PAIR_GROUPS = [
  ["Front struggle: fight free or die", /^fz-front-struggle/],
  ["Front attacks", /^fz-front/],
  ["Back struggle: fight free or die", /^fz-back-struggle/],
  ["Grabbed from behind", /^fz-back/],
  ["On a survivor who is down", /^fz-lying/],
  ["Ceiling ambush", /^fz-up-down/],
  ["Zombie waiting", /^fz-idle/],
  ["Survivors together", /^bd-hug/],
];
// what a clip is for, when its name doesn't say — shown under it on the review page
export const CLIP_NOTES = {
  "gp-mx-pistol-shooting": "the free Poly Haven pistol, two-handed aim",
  "gs-mx-pro-rifle-pack--sprint-right": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gr-mx-pro-rifle-pack--sprint-right": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gs-mx-pro-rifle-pack--sprint-left": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gr-mx-pro-rifle-pack--sprint-left": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gs-mx-pro-rifle-pack--sprint-backward-right": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gr-mx-pro-rifle-pack--sprint-backward-right": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gs-mx-pro-rifle-pack--sprint-backward-left": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gr-mx-pro-rifle-pack--sprint-backward-left": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gs-mx-pro-rifle-pack--sprint-backward": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gr-mx-pro-rifle-pack--sprint-backward": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gs-mx-pro-rifle-pack--sprint-forward-right": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gr-mx-pro-rifle-pack--sprint-forward-right": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gs-mx-pro-rifle-pack--sprint-forward-left": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gr-mx-pro-rifle-pack--sprint-forward-left": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gs-mx-pro-rifle-pack--sprint-forward": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gr-mx-pro-rifle-pack--sprint-forward": "rebuilt: gun carried across the chest at port arms, both hands on",
  "gr-mx-pro-rifle-pack--jump-up": "rebuilt: really leaves the ground now (a 35 cm jump)",
  "gs-mx-pro-rifle-pack--jump-up": "rebuilt: really leaves the ground now (a 35 cm jump)",
  "gr-mx-pro-rifle-pack--jump-loop": "in the air at the top of the jump",
  "gs-mx-pro-rifle-pack--jump-loop": "in the air at the top of the jump",
  "gr-mx-pro-rifle-pack--jump-down": "coming down and landing",
  "gs-mx-pro-rifle-pack--jump-down": "coming down and landing",
  "mx-agony": "losing their mind, or at their most afraid (Josh)",
  "mx-lying-down": "getting into a safe-room bed: starts on the bed's edge, so the bed holds it up (Josh)",
  "mx-climbing-ladder": "on a ladder: the ladder holds it up",
  "mx-climbing-to-top": "stepping off the top of a ladder",
  "mx-laying-sleeping": "asleep on the floor; a bed or cot raises it",
  // built in code (scripts/survivorz/anim-recipes.js) — not on Mixamo
  "bd-shiver": "built in code: cold or in shock, arms folded tight, shaking",
  "bd-cough": "built in code: a coughing fit, hand to the mouth",
  "bd-hammer": "built in code: nailing a board up. Rebuilt after your flag: a fist round the hammer, the other hand holding the nail; the hammer and plank here are stand-ins for the game's props",
  "bd-bandage": "built in code: sitting, bandaging their own forearm",
  "bd-flashlight-walk": "built in code: walking, the torch held out overhand, beam past the little finger",
  "bd-flashlight-run": "built in code: running with the torch out front",
  "bd-flashlight-jog": "built in code: jogging with the torch out front",
  "bd-flashlight-slow-run": "built in code: a slow run with the torch out front",
  "bd-inject": "built in code: forearm turned up, syringe in at a shallow angle, thumb presses, out, rubbed (seen from above)",
  "bd-can": "built in code: can held at the chest, forefinger lifts and peels the ring-pull, then a look in",
  "bd-keypad": "built in code: four digits and enter with the forefinger, light goes green",
  "bd-keycard": "built in code: card run down the reader's slot, light goes green",
  "bd-crowbar": "built in code: hooked end in a door's gap, three heaves, leaning back into each",
  "bd-hold-door": "built in code: leaning into a door, palms flat; it's hit twice from the other side",
  "bd-drag-body": "built in code: walking backwards bent over, hauling a body by the arms (the body is a stand-in; the game's is a ragdoll)",
  "bd-look-back-l": "built in code: sprinting, a panicked look back over the left shoulder",
  "bd-look-back-r": "built in code: the same over the right shoulder",
  "bd-molotov": "built in code: bottle by the neck, lighter under the rag, two flicks, it catches; the throw (with its wind-up) is the mocap throw that follows in game",
  "bd-shotgun-pump": "built in code on the real shotgun: the pump racked back and forward at the low ready",
  "bd-shotgun-load": "built in code on the real shotgun: three shells from the belt into the loading port, then a pump",
  "bd-hug": "built in code, fitted to each pair (30 of them; three shown). Rebuilt after your flag: they stand apart by their real body shapes, the arms go round the side, not through",
};
