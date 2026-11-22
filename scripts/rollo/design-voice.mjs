// Rollo's New York voice, designed rather than borrowed: ElevenLabs Voice
// Design turns a description into candidate voices. Josh listens and picks
// one; that recording becomes the reference the local voice clone (on the
// 3090 Ti) speaks with, so nothing leaves the house at play time.
//
//   node scripts/rollo/design-voice.mjs [rollo|announcer|duke|tasha|chase|host|claudia]  → scripts/rollo/voice-previews/*.mp3
//
// "announcer" is the Derby's race caller (client/src/lib/derby-call.ts);
// duke, tasha and chase are the rest of the floor cast (src/npc/cast.ts). The
// pick is copied to D:/solace-ai/models/voices/<name>.mp3 and the agent
// speaks with it from then on.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const KEY = env.match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error("No ELEVENLABS_API_KEY in .env");

const WHO = process.argv[2] ?? "rollo";
const ROLLO_TEXT =
  "Hey, hey, hey! Look who it is. Listen, pal, I'm tellin' you, the slots are runnin' hot tonight, I can feel it. " +
  "You got fifty silver you could spot me? I'm good for it. Swear on my mother. Ah, forget about it, " +
  "that horse was a bum anyway. Hey, Mara! Pull up a stool, the next round's on you.";

const ROLLO = {
  queens: "A man in his late forties from Queens, New York, with a thick, unmistakable New York accent — dropped r's, " +
    "nasal vowels, fast patter. Raspy from cigarettes, loud and friendly, a down-on-his-luck gambler who talks with his hands. " +
    "Casual, warm, a little desperate.",
  brooklyn: "A gravelly middle-aged Brooklyn guy with a heavy old-school New York accent, like a cab driver or a bookie. " +
    "Deep, rough voice, quick and charming, a hustler who's always working an angle. Slightly hoarse, very expressive.",
};

const ANNOUNCER_TEXT =
  "And they're off! Major Tom rockets out to an early lead, Escargo is taking his time, and Ribbit-9000 is hopping " +
  "right along! Down the stretch they come! Here comes Old Reliable! Neck and neck at the wire, and it's Gerald! " +
  "Gerald wins it! What a race, folks, what a race!";
const ANNOUNCER = {
  classic: "A classic American horse-racing track announcer in his fifties, rich clear baritone, rapid-fire excited " +
    "race-calling cadence that builds to a roar at the finish line, old-school radio broadcaster energy.",
  hype: "An over-the-top sports commentator with huge energy, booming and theatrical, a little ridiculous, " +
    "like a monster-truck rally announcer calling a race between cartoon characters. Fast, loud, delighted.",
};
const CAST = {
  duke: {
    text: "Son, let me tell you about the Siege of Tau-9. Forty enemy dreadnoughts, and me with nothing but a wrench and a bad attitude. " +
      "Thank you for your service? Oh, you don't have to. But you're welcome. Bartender! A double, for a disabled veteran. My knees, you understand.",
    designs: {
      blowhard: "A loud, boastful American man in his sixties, a retired navy chief petty officer. Gravelly barroom voice, booming and self-important, " +
        "slightly drunk, folksy and obnoxious, tells tall tales with total confidence. Gruff, warm underneath, very theatrical.",
      salty: "An old salty American sailor in his sixties with a deep raspy whiskey voice, Southern twang, big laugh, loud, pompous and full of himself, " +
        "talks like he's holding court at a VFW bar.",
    },
  },
  tasha: {
    text: "Well, hello there, sugar. Don't look so scared, Mama doesn't bite. Unless you ask nicely. " +
      "Twenty-two years I headlined the Saturn Follies, honey, and they replaced me with a hologram. A hologram! Pour me another, tin man.",
    designs: {
      showgirl: "A glamorous, bitter former showgirl in her late fifties. Husky, smoky alto voice, theatrical and sultry, sharp-tongued and sarcastic, " +
        "old Hollywood diva energy with a raspy edge, flirtatious and cutting.",
      diva: "A brassy American woman in her fifties with a deep, raspy, cigarette-worn voice, a faded burlesque star. Dramatic, campy, seductive, " +
        "with a chip on her shoulder, every line a performance.",
    },
  },
  // THE SEASON'S HOST (Josh, Oct 16 2026: "the announcer makes the show …
  // a classic game show host british accent"): the voice that narrates the
  // seven-day game show live, in a humorous way.
  host: {
    text: "Good evening, and welcome back to the casino floor! Day three, and what a day it's been. Duke has bet the house on a three-star horse, " +
      "Tasha is holding the Idol like it owes her money, and Chase is explaining crypto to a slot machine. Only one of them can win, " +
      "two of them are going home for good, and frankly, I wouldn't put money on any of them. Let's see who cracks first!",
    designs: {
      classic: "A classic British television game show host in his fifties, polished received-pronunciation accent, warm, smooth and twinkly, " +
        "a velvet baritone with impeccable comic timing, cheeky and arch, like a beloved Saturday-night quiz show presenter. Theatrical but never shouting.",
      cheeky: "A cheeky, quick-witted British game show presenter in his forties, London accent with a posh polish, bright and playful, " +
        "dry sarcastic humour, big showman energy, delivers one-liners with a wink, like a late-night British panel show host.",
    },
  },
  // SOLACE SURVIVORZ: Claudia, the bench's first newcomer (docs/survivorz/cast/claudia.md) — a
  // Halcyon assistant hiding where she worked, who tells the group she was a visitor. The pick is
  // copied to slopbot as /data/solace-ai/models/voices/survivor-claudia.mp3 (src/survivorz/voices.ts).
  claudia: {
    text: "Is someone out there? Please, I'm in here, the door's stuck. Oh thank God. No, no, I don't work here, I was just visiting, " +
      "a contractor thing, phones. I've been in here four days, maybe five, I lost count. I'm sorry, I'm okay. I'm okay. " +
      "Just, please don't leave me in here.",
    designs: {
      shaken: "A woman in her early thirties, American, an office assistant who has been hiding alone in the dark for days. Soft, clear, " +
        "slightly breathy voice, polite and careful, trying hard to sound calm but trembling underneath, quick nervous breaths, close to tears.",
      composed: "A composed, office-polite American woman around thirty, a corporate executive assistant. Light, articulate mid-range voice, " +
        "measured and careful, hiding fear behind professional politeness, a slight quaver when she lies, warm but guarded.",
    },
  },
  chase: {
    text: "Bro. Bro. Listen. I'm long Tesla at three x, high conviction, it's literally about to rip. " +
      "Up at four, cold plunge, checked the futures. Hey, quick thing, you got like two hundred silver? I'll three x it for you, guaranteed.",
    designs: {
      finbro: "A cocky American man in his late twenties, a fast-talking finance bro. Bright, confident, slightly nasal voice, upbeat and hyped, " +
        "talks too fast and too sure of himself, a little vocal fry, a salesman's charm.",
      hustler: "An overconfident young American guy around thirty, a crypto day-trader and hustle-culture podcaster. Energetic, smug, " +
        "loud and smooth, quick patter, frat-house swagger.",
    },
  },
};
const TEXT = WHO === "announcer" ? ANNOUNCER_TEXT : CAST[WHO]?.text ?? ROLLO_TEXT;
const DESIGNS = WHO === "announcer" ? ANNOUNCER : CAST[WHO]?.designs ?? ROLLO;

const out = new URL("./voice-previews/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const [name, voice_description] of Object.entries(DESIGNS)) {
  const res = await fetch("https://api.elevenlabs.io/v1/text-to-voice/create-previews", {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({ voice_description, text: TEXT }),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const { previews } = await res.json();
  previews.forEach((p, i) => {
    const file = new URL(`${WHO in CAST ? WHO + "-" : ""}${name}-${i + 1}.mp3`, out);
    writeFileSync(file, Buffer.from(p.audio_base_64, "base64"));
    console.log(`${WHO in CAST ? WHO + "-" : ""}${name}-${i + 1}.mp3  (${p.generated_voice_id})`);
  });
}
