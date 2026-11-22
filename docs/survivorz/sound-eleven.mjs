// SOLACE SURVIVORZ — THE ELEVENLABS PROMPTS. Every generated sound is made from a line here,
// so it can be regenerated or retuned by editing words, never by hunting for a file.
// scripts/survivorz/sound-eleven.mjs reads this.
//
// THE CREATURES SHARE ONE VOICE EACH. A walker that groans from one source, screams from
// another and dies from a third sounds like three different animals, so every state of a
// zombie type is written from the same description: only the action changes.
//
// secs: the length asked for. takes: how many to make. influence: how literally ElevenLabs
// follows the words (0-1; higher = closer to the prompt, less variety).

// the walker: the facility's ordinary infected, once staff
export const WALKER = "an adult human zombie, once a man, with rotted vocal cords: a wet, raspy, guttural throat, choked and bubbling, inhuman but still recognisably human. Dry close recording, no reverb, no music";
// the experimental: Halcyon's mutated test subjects
export const MUTANT = "a mutated laboratory creature that was once human: an inhuman throat with clicking, wet rattling and a layered high and low voice, unsettling and alien. Dry close recording, no reverb, no music";
const REAL = "realistic recording, dry, no music";

export const ELEVEN = {
  // ── the comparison set (compare1) ──────────────────────────────────────────
  "gun-pistol-shot": { set: "compare1", takes: 2, secs: 2, influence: 0.6, prompt: `a single 9mm pistol gunshot fired indoors in a concrete corridor, close, sharp crack and short echo tail, ${REAL}` },
  "gun-rifle-shot": { set: "compare1", takes: 2, secs: 2, influence: 0.6, prompt: `a single AK-47 assault rifle gunshot fired indoors in a concrete hall, close, loud crack and short echo tail, ${REAL}` },
  "gun-shotgun-shot": { set: "compare1", takes: 2, secs: 2.5, influence: 0.6, prompt: `a single 12 gauge pump shotgun blast fired indoors in a concrete room, close, deep boom and short echo tail, ${REAL}` },
  "gun-pistol-slide": { set: "compare1", takes: 2, secs: 1.2, influence: 0.6, prompt: `a semi-automatic pistol slide racked back and released, sharp metallic clack, close foley, ${REAL}` },

  "zombie-idle": { set: "compare1", takes: 2, secs: 4, influence: 0.5, prompt: `${WALKER}. It stands idle, groaning and moaning slowly, wheezing breaths between groans` },
  "zombie-alert": { set: "compare1", takes: 2, secs: 2.5, influence: 0.5, prompt: `${WALKER}. It suddenly spots a person and lets out a raw, ragged scream of hunger` },
  "zombie-chase": { set: "compare1", takes: 2, secs: 4, influence: 0.5, prompt: `${WALKER}. It runs after a person, snarling and growling with fast, heavy, gurgling breaths` },
  "zombie-attack": { set: "compare1", takes: 2, secs: 1.5, influence: 0.5, prompt: `${WALKER}. It lunges at a person with a short, violent attack snarl` },
  "zombie-eat": { set: "compare1", takes: 2, secs: 5, influence: 0.5, prompt: `${WALKER}. It crouches over a body feeding: wet tearing flesh, chewing, gnawing, low guttural grunts while it eats` },
  "zombie-death": { set: "compare1", takes: 2, secs: 2.5, influence: 0.5, prompt: `${WALKER}. It is killed: a choking death gurgle and a last rattling breath, then silence` },
  "zombie-exp-idle": { set: "compare1", takes: 2, secs: 4, influence: 0.5, prompt: `${MUTANT}. It stands idle, clicking and growling softly, wet rattling breaths` },
  "zombie-exp-scream": { set: "compare1", takes: 2, secs: 2.5, influence: 0.5, prompt: `${MUTANT}. It lets out a piercing, inhuman shriek` },

  // ── round two (compare2): the three the library won, re-rolled with sharper prompts ──
  "gun-pistol-shot#2": { set: "compare2", takes: 4, secs: 1.5, influence: 0.75, prompt: `one single Glock 17 9mm handgun shot fired inside a small concrete room, recorded 5 metres away: an instant sharp supersonic crack, a hard slap off the walls and a short boxy decay, no echo trail, ${REAL}` },
  "zombie-alert#2": { set: "compare2", takes: 4, secs: 2, influence: 0.55, prompt: `${WALKER}. It sees a person and bursts into a sudden, loud, tearing roar-scream with a ragged gurgling throat, furious and hungry` },
  "zombie-exp-idle#2": { set: "compare2", takes: 4, secs: 4, influence: 0.55, prompt: `${MUTANT}. It stands still, breathing in slow wet rasps, a low throat growl with irregular clicks and a faint high whine under it` },
};
