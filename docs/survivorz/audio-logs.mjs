// SOLACE SURVIVORZ — THE AUDIO LOGS. The recordings the survivors find (RECORDS.md says where
// each one is and what it reveals). Each is spoken by its writer's designed ElevenLabs voice
// (eleven_v3; the [tags] are performance directions, never spoken). The game adds the device
// sound: a handheld recorder's tape for most, a phone line for Ashby's call.
//
// VOICE DESIGNS: each writer is designed on ElevenLabs Voice Design (three takes), Josh picks
// one, and its saved voice id goes in VOICE below. Every log is previewed by Josh before it is
// kept, like every other sound.

export const DESIGNS = {
  reyes: {
    design: "An American man in his mid forties, a brilliant research virologist. Soft-spoken, educated and precise, exhausted to the bone and eaten up by guilt, a slight tremor under a calm voice. Recorded close on a small handheld voice recorder in a quiet lab at night.",
    sample: "Log thirty-one. I keep telling myself that somebody would have built it. That's not the same thing as it being me.",
  },
  kane: {
    design: "A Southern American man from Georgia in his late fifties, head of security and an ex-Army sergeant. Deep, gravelly, slow and steady, a man of few words who doesn't scare easily and is scared now. Recorded on a handheld recorder.",
    sample: "Kane. Eleven at night. I drove those men out to Cedar Ridge this morning, and nobody's told me yet what was in that case.",
  },
  cole: {
    design: "An American woman in her early thirties, a young research scientist. Warm, quick and bright, trying to stay calm and professional while she is frightened, a little breathless. Recorded close on a handheld recorder.",
    sample: "Hannah Cole, cell three. If you've found this, the Lazarus notes are in the Deep Lab. And I'm sorry about the door.",
  },
  delaney: {
    design: "A Southern American man in his fifties, a facilities maintenance man. Folksy, chatty and funny, jokes his way through being scared, a warm working man's voice. Recorded on a cheap dictaphone.",
    sample: "Gus Delaney, May the second, recording for posterity. Or for whoever finds the peaches. Eat those first, they don't keep.",
  },
  ashby: {
    design: "A refined English man in his mid forties with a polished, educated British accent, a corporate liaison. Pleasant, patient, warm on the surface and entirely without pity underneath, never raises his voice. Recorded over a phone line.",
    sample: "I do understand, Doctor. Truly. But Site Nine is an asset that has completed its purpose, and nobody is coming.",
  },
};

// filled in once Josh picks a design take for each writer
// Josh picked 2026-10-23: Reyes 1, Kane 1, Cole 3, Delaney 1, Ashby 3
export const VOICE = {"reyes":"91kvd965KbGLhXMZgyAz","kane":"DxVSf0uenyJYUxy97UbJ","cole":"ZNeaYXxVOJUpCR7WyvjU","delaney":"GPh9fCcoVWVzJ3TOLKSM","ashby":"suC1iO4kkeROxQDSFqmp"};

export const LOGS = [
  { id: "log-a01", who: "reyes", record: "R-10", where: "clean-lab-a", text:
    "[tired, quiet] Reyes. Recorded log thirty-one. [pause] For the record, since nobody else is going to keep one. " +
    "Program Nine was never a countermeasure. I was given a specification. High transmission. Near-total mortality. Rapid onset. " +
    "And one requirement I wrote on the whiteboard and stared at for a week: [slowly] the hosts remain mobile. They carry it outward themselves. " +
    "[sighs] I met every line of it. I added one thing they didn't ask for. A switch. A protein that could turn the whole thing off. " +
    "They wouldn't fund it. They said a product doesn't need an off button. [pause] I keep telling myself that somebody would have built it. " +
    "[quietly] That's not the same thing as it being me." },
  { id: "log-a02", who: "kane", record: "R-22", where: "camera-room", text:
    "[low, steady] Kane. April second. It's... eleven at night, I think. I'm still sitting in the truck. " +
    "Drove two water authority men out to the Cedar Ridge pumping station at dawn. Only they weren't water authority. I've been doing this eleven years, I know a man who's never held a wrench. " +
    "They opened valve housing three and put something in it out of a Halcyon cold case. Took four minutes. " +
    "Nobody told me what it was. Nobody told me not to ask, either. [pause] I didn't ask. [exhales] " +
    "Eleven years I've been head of security here. I'm starting to wonder what exactly I've been securing." },
  { id: "log-a03", who: "reyes", record: "R-18", where: "quarantine", text:
    "[hushed, urgent] Log forty-four. Cedar Ridge, day six. " +
    "The quarantine line held for four days. Then the clinic in town reported bite injuries. Then [pause] it reported the deceased... returning to the clinic. " +
    "It changed. In the water, it changed. The binding's different, the course is different, it lasts in the dead now. " +
    "The models said nine days and done. [shaky laugh] It isn't doing what I built it to do. It's doing better. " +
    "The line's gone. Anvil's people pulled back at three this afternoon. [quietly] It got away. God help us, it got away." },
  { id: "log-a04", who: "ashby", record: "R-26", where: "control-room", text:
    "[pleasant, patient] I do understand, Doctor. Truly. And I'm grateful you called, I know it can't have been easy. " +
    "But nobody is coming. I want to be honest with you about that, you've earned honesty. " +
    "Site Nine is an asset that has completed its purpose, and an asset that knows what it is becomes a liability rather quickly. You'll appreciate that. You built the thing. " +
    "[warmly] The board asked me to pass on its thanks. Sincerely. Your work has sold three times, which I'm told is something of a record. " +
    "[pause] I'm going to hang up now, Evelyn. Please don't make the decommission more unpleasant than it has to be." },
  { id: "log-a05", who: "kane", record: "R-27", where: "control-room", text:
    "[breathing hard, then steadying] Kane. May third. Past midnight. " +
    "Every door on this site just locked itself. Remote order, not ours. Vault's sealed from the outside. Nobody's coming in and nobody's going out. " +
    "[pause] One of the subjects got loose in the transfer. I put it back. It got my arm first. " +
    "I know what that means. I've watched it for a month. [quietly] I figure I've got till morning. " +
    "I'm taking the level three card with me, so nobody panics their way into the armoury. " +
    "If you're hearing this, and you need that card... you're gonna have to take it off me. [firm] Don't hesitate. I'd have done it for you. " +
    "[softer] Rosa, if this somehow gets to you... I'm sorry, honey. I'm sorry." },
  { id: "log-a06", who: "reyes", record: "R-37", where: "deep-lab", text:
    "[practical, tired] Lazarus. The procedure, for whoever comes after us. " +
    "One. The Deep Lab needs power. Not the emergency bus, real power, from the generator hall. " +
    "Two. The tissue has to be first generation. A Containment subject, fresh, under a minute. Keep it cold or it's useless in six hours. " +
    "Three. Two hours at the bench. You can step away and come back, it'll hold. [pause] And it's loud. I'm sorry. The centrifuge sounds like a jet engine and everything in this place can hear it. " +
    "Three doses a batch. [firmly] And you put every batch on the analyser before you trust it. Every batch. Hannah's first one nearly worked. Nearly isn't a cure." },
  { id: "log-a07", who: "reyes", record: "R-39", where: "clean-lab-a", text:
    "[weak, feverish, coughing] Batch two. It's... it's good. The analyser says it's good. [coughs] " +
    "It works if it's given before the turn. [pause] I gave it to myself too late. [shaky breath] " +
    "So you'll have to be quicker than me. That shouldn't be hard. [weak laugh, coughs] " +
    "Lucy. [long pause] Lucy, sweetheart, if anybody ever... your dad, he tried, he really... [trails off, laboured breathing]" },
  { id: "log-a08", who: "cole", record: "R-17", where: "quarantine", text:
    "[calm, frightened, a little breathless] Hannah Cole. Cell three. May sixth, I think. [pause] It's the fever. I know the course better than anyone alive, which is a funny thing to be good at right now. " +
    "If you've found this, the Lazarus notes are in the Deep Lab, by the analyser. Sam's finished it. It works if you're fast. " +
    "Don't let anyone tell you it can't be done. It can. It nearly worked on my first try. [shaky breath] " +
    "And... I'm sorry about the door. I locked it from the inside. Don't open it. Whatever's in here isn't me anymore. [quietly] Okay. Okay. That's all." },
  { id: "log-a09", who: "delaney", record: "R-31", where: "boiler", text:
    "[cheerful, nervous] Gus Delaney, May the second, recording for posterity. Or for whoever finds the peaches. " +
    "So. I've been squirrelling food behind this boiler since February. For the apocalypse. Which my wife said would never come. [laughs] And look at that. " +
    "Toolbox has a padlock on it. Combination's four fifty-one. Fahrenheit four fifty-one, the temperature books burn at. That's a joke, 'cause I don't read. [laughs nervously] " +
    "I'm gonna try the far tunnels. Pipe gallery grate comes off with a crowbar, I left one by it. [pause] If I'm not back for it, it's yours. " +
    "[softer] Eat the peaches first. They don't keep." },
];
