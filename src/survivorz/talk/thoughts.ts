// SOLACE SURVIVORZ — WHAT A SURVIVOR IS THINKING, WHEN NO MODEL WRITES IT (Josh, Oct 28 2026: "It
// would be good to know what the survivors are thinking as well, not just saying").
//
// The cast strip carries one short thought per survivor (wire `think`). With the brain on, minds.ts
// asks the model for one now and then; this file is the CODE half — a thought built from what
// drives the survivor's current choice (their mode, their worst need, a threat, the job, what's on
// their mind), so a card is never empty and the brain being off still reads as a show.
//
// PURE and read-only: it reads the survivor and their knowledge (`factsFor`, which mutates
// nothing) and never draws a random number, so the same world gives the same thought and the sim
// it reads plays exactly as it would with nobody thinking.
//
// THE OVERLAY'S RULE HOLDS HERE TOO: a bite is never a thought. The code half never reads
// `bitten` at all, and `BITE_WORDS` is what minds.ts refuses in a model's thought while the bite is
// hidden (the broadcast shows no known infection).
import type { SurvivorId } from "../genes";
import type { SimWorld, Survivor } from "../sim/world";
import { factsFor } from "./facts";
import { SHEETS } from "./sheets";

export interface CodeThought {
  text: string;
  /** what's driving it — a new key is a new thought; the same key holds the card */
  key: string;
  /** a danger that takes the card at once, whatever's on it */
  urgent: boolean;
}

/** Words a hidden bite would show in. A model thought with any of them, while the audience doesn't
 *  know of an infection, is refused (and the card keeps code's thought, which never names one).
 *  "turning" only as in turning INTO something: "turning the wheel" is the bunker's blast door, not a bite. */
export const BITE_WORDS = /\b(bit|bitten|bite|bites|biting|infect\w*|infection|turning(?! (?:the|that|this|it|a|back|round|around|over|off|on)\b)|turn into|scratch\w*|my arm|this arm|the wound|fever\w*|sick\w*)\b/i;

const nm = (who: SurvivorId): string => SHEETS[who]?.short ?? who;

/** A card's line: a thought is at most this long (the model is held to it too — minds.ts THINK). */
export const THOUGHT_CHARS = 90;
const fit = (t: string): string => (t.length <= THOUGHT_CHARS ? t : t.slice(0, THOUGHT_CHARS - 1).replace(/\s+\S*$/, "") + "…");

/** One of a few phrasings, chosen by who's thinking it (stable — never a random draw). */
function by(who: string, options: string[]): string {
  let h = 0;
  for (let i = 0; i < who.length; i++) h = (h * 31 + who.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

const MODE: Partial<Record<Survivor["mode"], string[]>> = {
  grabbed: ["Get it off me. Get it OFF me.", "Not like this. Not like this.", "Pull free. Pull free!"],
  down: ["Can't get up. Somebody come back for me.", "Stay awake. Somebody's coming.", "Don't leave me here."],
  panic: ["Can't breathe. Can't think.", "Too much. Way too much.", "Get out. Just get out."],
  flee: ["Run. Don't look back.", "Too many of them. Go, go, go.", "Move. Move!"],
  fight: ["Keep swinging. Don't let it close.", "Hit it again. Again.", "Stay on your feet."],
  // (what the body does: backing off is pulling back to a quieter room at a jog, hitting whatever gets in reach. The
  // card read "Back up slow. Don't turn your back on it." over a man jogging away with his back to them: watched Nov 13 2026)
  backoff: ["Too close. Pull back.", "Get clear. Give it room, then go."],
  hide: ["Don't move. Don't make a sound.", "Quiet. It'll pass. It has to."],
};

const JOB: Record<string, string[]> = {
  loot: ["There's got to be something useful in here.", "Check everything. We need all of it."],
  crank: ["Get that door shut. Nothing else matters.", "Turn the wheel. Do not stop."],
  repair: ["Come on, come on. Work.", "If this radio works, we get out of here."],
  call: ["Somebody has to be listening out there.", "Say it clear. Tell them where we are."],
  clear: ["Room by room. Make sure nothing's left.", "Check every corner. They hide."],
  regroup: ["Where is everybody?", "There have to be others down here."],
  guard: ["Somebody has to keep watch.", "Eyes on the door. Nothing gets past me."],
  rest: ["Catch my breath while I can.", "Sit. Just for a minute."],
};

/** The thought code would show for this survivor right now. */
const HEARD = [
  "Heard something out there. Close.",
  "That noise. Don't move.",
  "Something's moving. Which way?",
  "Was that a door? Listen.",
  "Quiet. Something's out there.",
  "Footsteps. Not ours.",
];
const SEEN = [
  "The dead are close. Stay sharp.",
  "There. Don't let it get near.",
  "Too close. Back off.",
  "Eyes on it. Weapon up.",
  "One of them. Maybe more.",
  "Keep your distance. Keep breathing.",
];

export function codeThought(w: SimWorld, s: Survivor): CodeThought {
  const u = (key: string, text: string): CodeThought => ({ key, text: fit(text), urgent: true });
  const n = (key: string, text: string): CodeThought => ({ key, text: fit(text), urgent: false });
  const mode = MODE[s.mode];
  if (mode) return u(`m:${s.mode}`, by(s.who, mode));
  if (s.mode === "sleep") return u("m:sleep", "Asleep.");
  if (s.bleeding) return u("need:bleed", by(s.who, ["I'm bleeding. Need to patch this up now.", "Bleeding. Stop it before anything else."]));
  const f = factsFor(w, s.who);
  if (s.hp < 35) return n("need:hurt", by(s.who, ["Hurting bad. One more hit and I'm done.", "Everything hurts. Keep it together."]));
  if (f?.me.thirst === "dehydrated") return n("need:water", "Need water before anything else.");
  if (f?.me.hunger === "starving") return n("need:food", "Starving. Can't think past food.");
  if (f?.me.sleep === "exhausted") return n("need:sleep", "Dead on my feet. Need to sleep.");
  const th = f?.threats[0];
  // One line per survivor, not one for the room: the cast strip showed six cards
  // reading the same thought word for word the moment anything was heard.
  if (th && th.ago === "just now") { const pool = th.what.startsWith("heard") ? HEARD : SEEN; return n("threat", pool[s.i % pool.length]); }
  const job = s.mode === "job" ? s.job : null;
  const ally = (i: number | undefined) => (i === undefined ? undefined : w.survivors.find((o) => o.i === i));
  if (job) {
    if (job.kind === "revive") { const a = ally(job.ally); return u(`job:revive:${a?.who ?? ""}`, a ? `Hold on, ${nm(a.who)}. I'm coming.` : "Get to them. Now."); }
    if (job.kind === "escort") { const a = ally(job.ally); return n(`job:escort:${a?.who ?? ""}`, a ? `Stay close to ${nm(a.who)}.` : "Stay close. Nobody alone."); }
    if (job.kind === "talk") { const a = ally(job.with); return n(`job:talk:${a?.who ?? ""}`, a ? `Good to have ${nm(a.who)} here.` : "Good to have somebody to talk to."); }
    const j = JOB[job.kind];
    if (j) return n(`job:${job.kind}`, by(s.who, j));
  }
  if (s.morale < 25) return n("mood:low", by(s.who, ["How much longer can we keep this up?", "What's the point of any of this?"]));
  const q = f?.questions[0];
  if (q) return n(`q:${q}`, q[0].toUpperCase() + q.slice(1) + ".");
  return n("idle", by(s.who, ["Taking stock.", "Think. What's next?", "Quiet. Too quiet."]));
}
