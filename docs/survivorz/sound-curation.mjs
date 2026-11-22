// SOLACE SURVIVORZ — HAND CORRECTIONS to the judged sound lists, applied last by
// scripts/survivorz/sound-candidates.mjs. The judge reads names; these are the names it
// read wrong. DROP: a file name (substring) that is not this sound. ADD: a file name
// (substring) that IS this sound but the search missed or filed elsewhere.
export const DROP = {
  "gun-rifle-bolt": ["Heavy Mech Cock"],             // sci-fi weapons pack
  "gun-casing": ["Shell Load_Round Eject"],           // that's loading a shotgun
  "zombie-claw": ["ANF003"],                          // an animal's paws walking
  "zombie-exp-scream": ["Dinosaur Growl"],
  "zombie-horde": ["Agony Scream"],                   // human soldiers screaming

  "step-vinyl-walk": ["CHOKE HOLD"],                  // a fight on the floor
  "step-water-sneak": ["Dragging Items Ambience"],    // a horror ambience bed
  "step-vent-crawl": ["Mixer Type 2"],                // a kitchen mixer in a vent
  ...Object.fromEntries(["walk", "run", "sneak"].map((p) => [`step-grating-${p}`, ["Barefoot"]])),   // survivors wear boots
  "melee-swing-heavy": ["golf club swing hit ball"],  // a golf ball being struck
  "body-fall": ["ORANGES"],
  "bed-medical": ["Fluorescent_Ballast"],             // that's the light bed
  "bed-power": ["Wind turbine"],                      // outdoors
  "bed-generator-hall": ["Circus"],
  "bed-containment": ["Clock_Freezer", "Restaurant_Bar"],
  "airlock-seal": ["Dungeon Door"],
  "vault-open": ["Lab_Door_Open_and_Close"],          // a sliding lab door, not a vault
  "pa-chime": ["Tannoy Announcement"],                // has a voice on it
  "alarm-klaxon": ["self_destruct_warning"],          // has a voice on it
  "terminal-boot": ["SNES Power On", "Floppy Failure"],
  "flashlight": ["headlights", "lesen cap"],          // a car switch, a camera lens cap
  "walkie-click": ["Electro Magnetic Fields", "noise-radio-signal"],
  "rummage": ["Newspaper"],
  "pickup": ["Casino Cards"],
  "score-colour-power": ["FAN Air Conditioner", "Amb,Industry"],   // field recordings, not music
};
export const ADD = {
  "gun-shotgun-load": ["Shell Load_Round Eject"],
};
