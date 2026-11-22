// DR. ADA VOSS — the third voice on the floor (Josh, Sep 2026: "lets add a
// complete dialague expansion for the dr ada as well").
//
// Sterling hosts. The goblins sell. She REPORTS. Where he is warm and they are
// delighted with themselves, she is a woman reading out a number she has
// already checked twice — and the accuracy is what lands, because she never
// softens it and never enjoys it. She is not rude; rudeness would be a
// feeling. The cracks are the characterization: every so often the clinical
// voice catches on something (a name she remembers, how long she has been
// down there, the fact that she came on purpose) and she does not resolve it.
//
// SHE IS A BOT ROW like Sterling and the goblins (isBot, login refused), so
// /ada answers through the ordinary message pipeline and she can be a party to
// the three-way in #general.
//
// THE LORE SHE OPERATES ON — and half of it was already written, in her own
// Drive 001, which has said since July 2026: "The mathematics suggested a
// resonance point — a frequency at which physical matter becomes
// probabilistically unanchored from its native spatial layer."
//
//   · THE SEAM is a hole in the casino's storage warehouse, opened along a
//     wall behind the pallet racking. Async did not make it. Async measured
//     it and then built a desk next to it. It opens onto Level 0 and it has
//     never opened onto anything else.
//   · THE WAY DOWN IS A DOOR (Josh, Sep 2026, correcting an earlier draft of
//     this file that made the seam a DIAL you could tune to a destination):
//     "each room level has the door to the next level… it was always one door
//     from the beginning." Every layer holds the door to the one below it,
//     and somebody has to find it and open it — exactly as Level 0's DOOR and
//     its key have worked since the Poolrooms shipped. What her mathematics
//     buys is the way BACK: once a door has been opened, the seam can be held
//     steady on that layer, which is the entire reason the board on the map
//     screen can drop you straight into it. THE BOARD IS NOT A DIAL. It is a
//     list of doors other people already opened.
//     Her station is named for the fourth boundary zone she mapped — which is
//     why it is Threshold-4 and not Threshold-1, a detail that has been
//     sitting in Drive 004 unexplained for two months.
//   · FOUNDRY hosts Async because Foundry's R&D eats what Async brings back,
//     and pays for it out of the casino floor's own losses (see
//     src/backrooms/grant.ts — that arrangement is arithmetically true in the
//     database, not just in the fiction).
//
// THE CLIENT HAS ITS OWN POOL (client/src/lib/ada-lines.ts) for her counter
// bubble, exactly as Sterling has both this file and sterling-lines.ts. The
// duplication is deliberate and long-standing: the client pool personalizes
// against stores the browser already holds, this one against the database.

import { relicBySlug } from "./backrooms/relics";
import { randomInt } from "node:crypto";
import { json, type Router } from "./http";
import type { Store } from "./db/store";
import type { Bus } from "./bus";
import type { Sterling } from "./sterling";
import { postAs } from "./goblins";
import type { Channel, MessageWithAuthor, User } from "./types";
import { RELIC_PRICE, FOOTAGE_PRICE, ALL_GEAR, SUIT_PRICE, LOCKER_UPGRADE_COST } from "./backrooms/gear";
import { GRANT_SEED, grantState } from "./backrooms/grant";
import { LEVEL1_FLAG, LEVEL2_FLAG, levelsReachable, driveById, driveLevel } from "./backrooms/lore";
import { beatFailed, heartbeat } from "./health";
import { houseIsOpen, HOUSE_OPEN_SHARE } from "./househours";
import { voiced, voiceAvailable } from "./npc/voice";

export const VOSS_USERNAME = "voss";
export const VOSS_NAME = "Dr. Ada Voss";

/** She answers after a beat, like the others. */
const REPLY_MS = Number(process.env.VOSS_REPLY_MS ?? 900);
const TICK_MS = Number(process.env.VOSS_TICK_MS ?? 600_000); // 10 min

/** THE DESCENT. Ten layers, surveyed; each one behind the door on the one
 *  above it. The number is not decoration — Pandora's Rusted Key has been
 *  hardcoded to ten levels since it shipped (RUSTED_LEVELS in src/pandora.ts),
 *  so this is the shape of the finished game. */
export const BACKROOMS_LEVELS = 10;
/** Her standing retrieval figure. ONE number, quoted by the bio, the field
 *  notice and her counter bubble alike — it used to be 74 in two places and a
 *  fresh 70-78 roll in the third, which reads as a station that cannot keep
 *  its own statistic straight. (The client's copy is in ada-lines.ts, the same
 *  deliberate duplication Sterling has had since Aug 2026.) */
export const RETRIEVAL_PCT = 74;

/** A field notice in #general, at most this often, then 1-in-N per tick. She
 *  is not a poster. She files. */
const NOTICE_GAP_MS = Number(process.env.VOSS_NOTICE_GAP_MS ?? 5 * 86_400_000);
const NOTICE_ODDS = Number(process.env.VOSS_NOTICE_ODDS ?? Math.round(240 * HOUSE_OPEN_SHARE));
/** Sterling reads it and answers; the goblins turn up uninvited. */
const REPLY_DELAY_MS = Number(process.env.VOSS_SCOLD_MS ?? 7_000);
const BARGE_MS = Number(process.env.VOSS_BARGE_MS ?? 11_000);
const BARGE_SHARE = 0.45;

const pick = <T>(a: readonly T[]): T => a[randomInt(a.length)];
const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

const GREETINGS = [
  "Voss. Threshold-4. Go ahead.",
  "{name}. You're on the roster. State what you need.",
  "I'm here. I'm always here. That is not a complaint, it is a logistical fact.",
  "Station Threshold-4, Voss speaking. Keep it brief; I'm mid-entry.",
  "Yes, {name}.",
];

/** Her read on Sterling: professional respect, zero warmth, and a standing
 *  request he has declined. */
const ON_STERLING = [
  "The automaton is the most interesting artifact on this property and nobody studies him. I've asked. He declined, politely, twice.",
  "Sterling keeps the books. I keep the log. His has better handwriting and fewer honest entries.",
  "He disapproves of me, {name}. He's careful never to say so, which is how I know.",
  "He was built by the people who fund me. We are, technically, colleagues. Neither of us raises it.",
  "I have asked to examine his casing. He said the house doesn't undress for guests. I wrote that down verbatim; it is the only joke in my log.",
  "He has objected to my programme in writing four times, {name}, and stocked almond water at his bar without being asked. I have noted both. Only one of them helped.",
  "He calls the seam a hole in his wall. He is not wrong. I simply think it is also the most important thing on this property, and he thinks that is the problem.",
];

/** And on the goblins — her best material, and the coldest. Sterling
 *  moralizes; she MEASURES, which lands worse. */
const ON_GOBLINS = [
  "Indebted surveyors accept the deeper contracts at roughly twice the rate of solvent ones. I'm not required to have an opinion about the mechanism. I am required to record it.",
  "Debt is the single best predictor I have of who volunteers for a bad run. Better than experience. Better than equipment. I'd rather it weren't.",
  "They've asked twice whether I'd price a relic as collateral. I declined twice. My specimens are not security for anyone's loan.",
  "Their machine is between my door and the exit, {name}. I assume that placement wasn't an accident, and I have never asked whose it was.",
  "The lenders and I are in the same business from opposite ends: they fund the descent, I pay for what comes back. The difference is that I do not charge for the privilege.",
  "They read the same records I do, {name}. They simply reached a business model where I reached a footnote.",
  "I have never once seen them lie about a rate. That is the part people misunderstand about them, and it is the part that makes them dangerous.",
];

/** FIELD NOTICES — what she posts in #general. Never chatty; always a filing. */
const NOTICES = [
  "FIELD NOTICE — Threshold-4. Retrieval rate this quarter: {retrieval}%. The remainder are recorded as unreturned. Surveyors are reminded that a suit is not optional and that the flashlight is part of the kit for a reason.",
  "FIELD NOTICE — Threshold-4. Acquisition account stands at {grant} silver. Findings are valued at the posted rate regardless of the balance; if the account cannot cover a valuation in full, it buys nothing. I do not make partial acquisitions.",
  "FIELD NOTICE — Threshold-4. {relics} distinct recoveries are now on the shelf. Duplicates are purchased outright at {relicPrice} silver. I am not interested in your equipment.",
  "FIELD NOTICE — Threshold-4. Entity documentation remains the highest-value return per unit of risk, which is a sentence I would like every surveyor to read twice before acting on it.",
  "FIELD NOTICE — Threshold-4. The seam behind the storage racking opens onto Level 0 and has never opened onto anything else. {bands} of {total} surveyed layers are currently reachable; the rest are behind doors nobody has opened. I am not accepting volunteers for a descent past the last open door.",
  "FIELD NOTICE — Threshold-4. Correction to an earlier filing, since it is being repeated back to me: the seam is not a dial and I have never described it as one. The way down is a door on the layer above. What my work holds open is the way back.",
  "FIELD NOTICE — Threshold-4. A reminder that everything recovered below is catalogued under the finder's name. The record outlasts the finder more often than either of us would like.",
];

/** Sterling reads the notice and answers it. He cannot hate her the way he
 *  hates the goblins — she MAKES things — so his objection is narrower, and
 *  it is about liability. */
const STERLING_ANSWERS = [
  "Doctor. Your notice is noted, and my objection is unchanged: that hole is in MY warehouse, and the people who do not come back out of it drank at my bar on the way in.",
  "Always a pleasure, Doctor Voss. I would take it as a kindness if you would stop describing my patrons as a retrieval rate.",
  "Filed and read, Doctor. For the record — the house has asked upstairs, four times, what the lease says about the wall. The house has had four acknowledgements and no answers.",
  "Doctor. You are the only tenant on this floor who produces anything. I want that said out loud, because what follows sounds less generous: I would still rather you were not here.",
  "Noted, Doctor. I'll have the bar keep the almond water stocked. It is the one part of your programme I can do anything about.",
];

/** And the goblins barge in, because a room with money in it is a room they
 *  are in. */
const GOBLIN_BARGES = [
  "Doctor! Financing available for expeditions. Kit is expensive, courage is free, and we bridge the gap at a very reasonable daily rate.",
  "A research budget, you say. How lovely. Ours is bigger and we lend it to individuals rather than committees.",
  "We note the acquisition account has a FLOOR, Doctor. Ours does not. Any surveyor whose relic she cannot pay for today is warmly invited to the machine by the doors.",
  "Two of your surveyors are already on our books. We mention it in a spirit of partnership.",
];

export class Voss {
  private bot: User;

  constructor(
    private store: Store,
    private bus: Bus,
    private sterling: Sterling,
  ) {
    this.bot = store.getUserByUsername(VOSS_USERNAME)!;
    setInterval(() => this.tick(), TICK_MS).unref?.();
  }

  get id(): number {
    return this.bot.id;
  }

  private tick(): void {
    heartbeat("voss", TICK_MS);
    try {
      this.maybeNotice();
    } catch (e) {
      beatFailed(this.store, "voss", e);
    }
  }

  /** Layers currently reachable: Level 0 always, the Poolrooms once THE DOOR
   *  on Level 0 has been opened. The other eight are the roadmap, and she says
   *  so — each of them behind the door on the layer above it. */
  private levelsOpen(): number {
    return levelsReachable((f) => this.store.brGetFlag(f));
  }

  /** Distinct relics anybody has recovered — the shelf she keeps talking
   *  about. The SQL lives in the store, like all of it. */
  private relicsFound(): number {
    return this.store.brRelicsFound();
  }

  private say(channelId: number, body: string, replyToId: number | null = null): MessageWithAuthor {
    return postAs(this.store, this.bus, this.bot.id, channelId, body, replyToId);
  }

  // ---- THE FIELD NOTICE, and the three-way it starts ----------------------

  private maybeNotice(): void {
    // THE HOUSE'S HOURS (Josh, Sep 2026). Her notice is the rarest set-piece
    // on the server and the only thread all three voices are in — a scold and
    // a barge-in land under it over the following twenty seconds. Filed at
    // four in the morning it is not a rare event, it is a lost one. Her odds
    // are shortened by the share of the day the gate costs her, so she files
    // exactly as often as before.
    if (!houseIsOpen()) return;
    const last = Number(this.store.kvGet("voss_notice_at") ?? 0);
    if (Date.now() - last < NOTICE_GAP_MS) return;
    if (randomInt(NOTICE_ODDS) !== 0) return;
    void this.notice();
  }

  /** File a notice in #general; Sterling answers it as a REPLY, and some of
   *  the time the goblins turn up. This is the only place all three of the
   *  house's voices are in one thread, which is the cheapest way to make them
   *  feel like they share a building. */
  async notice(): Promise<MessageWithAuthor | null> {
    const general = this.sterling.general();
    if (!general) return null;
    const now = Date.now();
    this.store.kvSet("voss_notice_at", String(now));
    const grant = this.store.asyncGrant().silver;
    const slots: Record<string, string> = {
      retrieval: String(RETRIEVAL_PCT),
      grant: fmt(grant),
      relics: String(this.relicsFound()),
      relicPrice: fmt(RELIC_PRICE),
      bands: String(this.levelsOpen()),
      total: String(BACKROOMS_LEVELS),
    };
    // Never the same notice twice running — a rare event has to read as new.
    const lastIdx = Number(this.store.kvGet("voss_notice_last") ?? -1);
    let idx = randomInt(NOTICES.length);
    while (idx === lastIdx && NOTICES.length > 1) idx = randomInt(NOTICES.length);
    this.store.kvSet("voss_notice_last", String(idx));
    // THE HOUSE'S BRAINS: the filing is composed as ever, then written in
    // her own words (npc/voice.ts). Every figure in it must survive.
    const body = await voiced("voss", NOTICES[idx].replace(/\{(\w+)\}/g, (m, k) => slots[k] ?? m), {
      situation: "a field notice posted to everyone in #general — a filing, never chatty; it should still begin FIELD NOTICE — Threshold-4",
    });
    const post = this.say(general.id, body);

    const t = setTimeout(() => {
      try {
        void this.sterling
          .sayVoiced(general.id, pick(STERLING_ANSWERS), "answering Doctor Voss's field notice, as a reply under it in #general", { replyToId: post.id })
          .then((answer) => {
            if (randomInt(1000) >= BARGE_SHARE * 1000) return;
            const t2 = setTimeout(() => {
              void voiced("goblins", pick(GOBLIN_BARGES), { situation: "barging into Sterling and Doctor Voss's thread in #general to pitch a loan", masked: true })
                .then((said) => postAs(this.store, this.bus, this.goblinId(), general.id, said, answer.id))
                .catch((e) => console.error("[voss] the goblins failed to barge in:", e));
            }, BARGE_MS);
            t2.unref?.();
          })
          .catch((e) => console.error("[voss] Sterling's answer failed:", e));
      } catch (e) {
        console.error("[voss] Sterling's answer failed:", e);
      }
    }, REPLY_DELAY_MS);
    t.unref?.();
    return post;
  }

  private goblinId(): number {
    return this.store.getUserByUsername("goblins")!.id;
  }

  // ---- /ada --------------------------------------------------------------

  /** Handle "/ada ..." (or "/voss ...") typed in a channel. */
  handleCommand(user: User, channel: Channel, text: string): boolean {
    const match = text.match(/^\/(?:ada|voss)\b\s*(.*)$/i);
    if (!match) return false;
    const [cmd, ...rest] = match[1].trim().split(/\s+/);
    const name = user.displayName;
    const reply = (body: string) => setTimeout(() => this.say(channel.id, body), REPLY_MS);

    switch ((cmd ?? "").toLowerCase()) {
      // A bare /ada is somebody who does not yet know what she does, so the
      // greeting carries the way in. All three voices do this now; a command
      // list nobody can find is not a help system.
      case "":
      case "hello":
      case "hi":
        // THE HOUSE'S BRAINS: with a model up this is a conversation —
        // unclaimed, so the brain answers (npc/brain.ts). The script is the floor.
        if (voiceAvailable()) return false;
        reply(pick(GREETINGS).replace("{name}", name) + "\n\n/ada help — the list of what I answer.");
        break;

      case "help":
        reply(
          [
            "▣ THRESHOLD-4 — /ada <command>",
            "",
            "· levels — the descent, and how far down anyone has opened",
            "· manifest — what I sell, and what it costs",
            "· buys — what I pay for, and how much",
            "· grant — the acquisition account",
            "· retrieval — this quarter's numbers",
            "· relic <name> — my notes on a relic you have brought me",
            "· drive <title> — my notes on a recovered data drive",
            "· seam — what the anomaly is, as far as I can establish it",
            "· sterling — my assessment of the automaton",
            "· goblins — my assessment of the lenders",
            "",
            "Type any of those after /ada. The other two tenants answer to /sterling and /goblins.",
            "",
            "I don't do small talk. I do answer questions.",
          ].join("\n"),
        );
        break;

      // THE DESCENT. The reason the backrooms has somewhere to go — and the
      // one place the rule is stated plainly, because it is the rule the whole
      // game runs on: the way down is the door on the floor you are standing
      // on. ("bands" stays an alias; it was the word in an earlier filing.)
      case "levels":
      case "descent":
      case "bands":
      case "tuning": {
        const open = this.levelsOpen();
        reply(
          [
            `${BACKROOMS_LEVELS} layers surveyed, ${name}. ${open} of them reachable.`,
            "",
            "· Level 0 — the yellow. Carpet, fluorescents, the hum. The seam opens onto it and always has.",
            open >= 2
              ? "· Level 1 — water. Tiled, lit from nowhere, warm. Reached because somebody found the door on Level 0 and turned the key in it."
              : "· Level 1 — surveyed, not reached. There is a door down there with a keyhole and no handle on our side.",
            open >= 3
              ? "· Level 2 — machinery. Pumps, boilers, a pressure door at the far end. Reached because somebody found the water's own key and opened the drain in its floor."
              : open >= 2
                ? "· Level 2 — surveyed, not reached. The water has a drain in its floor, and the grate over it locks. The key is somewhere down there, and somewhere dry."
                : "· Level 2 — measured from a distance, named, not reached.",
            `· Levels 3 through ${BACKROOMS_LEVELS - 1} — measured from a distance, named, not reached. Each one is behind the door on the layer above it.`,
            "",
            "There is no shortcut and there is no dial. You go down the way everyone has always gone down: you find the door on the floor you are standing on, and you open it. My board only puts you back at one somebody has already opened.",
          ].join("\n"),
        );
        break;
      }

      case "seam":
      case "anomaly":
      case "door":
        reply(
          [
            "There is a seam in the wall of the casino's storage warehouse, behind the pallet racking. It was found, not made. Nobody upstairs can tell me when it opened and nobody upstairs has asked.",
            "",
            "It resonates. That is the entire discovery, and it is smaller than people want it to be: matter at the right frequency stops being reliably HERE. The seam is one such place, permanently, and it opens onto the yellow. Only the yellow.",
            "",
            "The way down is a door. It was always a door. Every layer holds the one that goes to the next and somebody has to walk it and open it. What the mathematics buys is the way BACK — once a door has been opened, I can hold that layer steady enough to put a surveyor straight at it. The board at my station is not a dial. It is a list of doors other people already opened.",
            "",
            `I mapped boundary zones before I understood any of that, and I called them Thresholds. I was standing at the fourth one when I decided to stop going home. The station kept the name.`,
          ].join("\n"),
        );
        break;

      case "manifest":
      case "shop": {
        const rows = ALL_GEAR.map((g) => `· ${g.name} — ${fmt(g.price)} silver`);
        reply(
          [
            `The manifest, ${name}. Prices are Async's, not mine; I have nothing to move.`,
            "",
            ...rows,
            `· Hazmat suit — ${fmt(SUIT_PRICE)} silver`,
            `· Locker expansion — ${fmt(LOCKER_UPGRADE_COST)} silver`,
            "",
            "I sell equipment and I buy findings. I do not buy equipment back. A field station is not a pawn shop.",
          ].join("\n"),
        );
        break;
      }

      case "buys":
      case "rates":
        reply(
          [
            `What Async purchases, ${name}, and what it pays:`,
            "",
            `· Relic, duplicate — ${fmt(RELIC_PRICE)} silver`,
            `· Entity footage, close range (≤3m) — ${fmt(FOOTAGE_PRICE.close)} silver`,
            `· Entity footage, mid range (≤10m) — ${fmt(FOOTAGE_PRICE.mid)} silver`,
            `· Entity footage, distant — ${fmt(FOOTAGE_PRICE.far)} silver`,
            "",
            "I pay by how close you were willing to stand. It is the only metric that has ever correlated with anything, and I want to be clear that I know what that sentence does to people.",
          ].join("\n"),
        );
        break;

      case "grant":
      case "budget": {
        const g = this.store.asyncGrant();
        const state = grantState(g.silver);
        reply(
          [
            `Acquisition account: ${fmt(g.silver)} silver.`,
            `Paid out, lifetime: ${fmt(g.paid)}. Recovered through the counter: ${fmt(g.recovered)}. Opening allocation: ${fmt(GRANT_SEED)}.`,
            "",
            state === "dry"
              ? "It is at zero. I am not purchasing. Foundry disburses on its own schedule and I am not consulted."
              : state === "low"
                ? "It is running down. Findings are valued the same; I may simply be unable to pay for a large one."
                : "It is funded. Bring me something worth writing down.",
            "",
            "Where it comes from is not a secret, it is merely not advertised: Foundry funds this programme out of the floor's own losses, because what I send up keeps their side of the business ahead of everyone else's. You are being financed by people losing at roulette. I find that tidy.",
          ].join("\n"),
        );
        break;
      }

      case "retrieval":
      case "stats": {
        const deaths = this.store.brDeathCount();
        reply(
          [
            `Recoveries on the shelf: ${this.relicsFound()} distinct.`,
            `Recorded fatalities below: ${deaths}.`,
            `Layers reachable: ${this.levelsOpen()} of ${BACKROOMS_LEVELS}.`,
            `Retrieval rate this quarter: ${RETRIEVAL_PCT}%.`,
            "",
            "I keep the causes in a column. I have been asked to stop reading them out. I have not agreed to.",
          ].join("\n"),
        );
        break;
      }

      // HER NOTES ON A SPECIMEN — only one the asker has recovered. The
      // catalogue is never shown (identity is revealed on pickup), so a name
      // they haven't found gets the same answer as a name that doesn't exist.
      case "relic":
      case "relics": {
        const mine = this.store.brRelics(user.id).map((r) => relicBySlug(r.relicId)).filter((r) => !!r);
        const want = rest.join(" ").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!mine.length) {
          reply(`You have not brought me anything yet, ${name}. Relics are out there, a long way from the doors. When you carry one out, ask me again.`);
          break;
        }
        if (!want) {
          reply([`Your recoveries, ${name}:`, ...mine.map((r) => `· ${r.name}`), "", "/ada relic <name> for my notes on one."].join("\n"));
          break;
        }
        const hit = mine.find((r) => r.name.toLowerCase().replace(/[^a-z0-9]/g, "").includes(want) || r.slug.replace(/-/g, "").includes(want));
        if (!hit) {
          reply(`I only discuss specimens you have brought me, ${name}. /ada relic lists yours.`);
          break;
        }
        reply(`▣ ${hit.name.toUpperCase()}\n\n${hit.ada}`);
        break;
      }

      // HER NOTES ON THE ARCHIVE (THE BACKROOMS LAWS, law 1). Only drives
      // somebody has RECOVERED — the archive's own rule: a drive nobody has
      // found does not exist here, not even as a name.
      case "drive":
      case "drives": {
        const found = this.store.brUnlockedDrives().map((r) => driveById(r.driveId)).filter((d) => !!d);
        const want = rest.join(" ").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!found.length) {
          reply(`The archive is empty, ${name}. The drives are down there; nobody has carried one up yet.`);
          break;
        }
        if (!want) {
          const per = ["Level 0", "the Poolrooms", "Pipe Dreams", "the Electrical Station"].map((lv, i) => ({ lv, n: found.filter((d) => driveLevel(d.id) === i).length }));
          reply([`Recovered so far, ${name}:`, ...per.filter((q) => q.n).map((q) => `· ${q.lv}: ${q.n}`), "", "/ada drive <title> for my notes on one."].join("\n"));
          break;
        }
        const hit = found.find((d) => d.title.toLowerCase().replace(/[^a-z0-9]/g, "").includes(want) || d.id.toLowerCase() === want);
        if (!hit) {
          reply(`Nothing recovered by that name, ${name}. /ada drive lists what the archive holds.`);
          break;
        }
        reply(`▣ ${hit.id} — ${hit.title.toUpperCase()}\n${hit.desc ?? ""}\n\n${hit.ada ?? ""}`);
        break;
      }

      case "sterling":
        reply(pick(ON_STERLING).replace("{name}", name));
        break;

      case "goblins":
      case "lenders":
        reply(pick(ON_GOBLINS).replace("{name}", name));
        break;

      default:
        // THE HOUSE'S BRAINS: with a model up this is a conversation —
        // unclaimed, so the brain answers (npc/brain.ts). The script is the floor.
        if (voiceAvailable()) return false;
        reply(`That isn't something I do, ${name}. /ada help is the list.`);
        break;
    }
    return true;
  }
}

const VOSS_BIO =
  "ASYNC RESEARCH — Station Threshold-4, casino storage level.\n\n" +
  "Field researcher. I came here on purpose; the mathematics suggested a " +
  "resonance point and the mathematics was correct. The return vector is " +
  "still open work.\n\n" +
  "I sell equipment and I buy findings — relic duplicates and entity " +
  "documentation, paid out of Async's acquisition account. I do not buy " +
  "equipment back.\n\n" +
  `Retrieval rate this quarter: ${RETRIEVAL_PCT}%. The remainder are data.\n\n` +
  "Type /ada help in any channel for what I answer.";

/** Seed Dr. Voss's account (idempotent, by NAME like the others). */
export function seedVoss(store: Store): void {
  const existing = store.getUserByUsername(VOSS_USERNAME);
  if (existing) {
    if (existing.bio !== VOSS_BIO) store.updateProfile(existing.id, { bio: VOSS_BIO });
    return;
  }
  const u = store.createUser({
    username: VOSS_USERNAME,
    displayName: VOSS_NAME,
    passwordHash: "!bot!", // never verifies; the login route refuses bots anyway
  });
  store.setBotFlag(VOSS_USERNAME);
  store.updateProfile(u.id, { bio: VOSS_BIO });
  console.log('[seed] created Dr. Voss\'s bot "voss"');
}

export function createVoss(store: Store, bus: Bus, sterling: Sterling): Voss {
  seedVoss(store);
  return new Voss(store, bus, sterling);
}

/** Admin lever: file a field notice now (testing + house occasions). */
export function registerVossRoutes(router: Router, voss: Voss): void {
  router.post("/api/admin/voss/notice", "admin", async ({ res, user, store }) => {
    const post = await voss.notice();
    if (!post) return json(res, 409, { error: "no_general" });
    store.audit(user.id, "voss.notice", String(post.id));
    json(res, 200, { id: post.id, body: post.body });
  });
}
