# SOLACE SURVIVORZ — the YouTube channel (AGREED by Josh, 2026-11-01)

Josh took all six recommendations in section 1 (2026-11-01). Nothing is set up in YouTube or built yet.
Sections 2–8 are the plan and the copy, written for the recommended choices, ready
to paste into YouTube Studio.

**The tone rule for everything on the channel:** there's no host, so the channel has
no presenter voice either. No "smash that like button", no hype words, no exclamation
marks. It speaks like the show's own graphics do: short, factual, a little cold. The
In Memoriam card (serif, black, "Day 1 · bled out") is the channel's signature, and
the facility's clinical look (amber `#e8b04a`, live red `#ff3b30`, white Inter Black,
Georgia for memorials) is its palette, the same as the overlay.

---

## 1. The six choices

**1. Channel identity — recommend "Solace Survivorz", handle @SolaceSurvivorz.**
A channel about one thing grows faster: a stranger knows what subscribing gets them.
The other option is an umbrella "Solace" channel for every future show. That costs
nothing to switch to later: a channel can be renamed any time, and a handle changed
twice in 14 days. So start specific and rename to "Solace" only if a second show ever
streams. **Josh got @SolaceSurvivorz (2026-11-01).** **Then, the same day, Josh made the
channel SOLACE TV** — a channel of AI-made survivor stories, of which Solace Survivorz is
the first. The handle stays @SolaceSurvivorz; see §2.

**2. Age restriction vs being found — recommend: the stream stays age-restricted (your
call), the Shorts are clean and unrestricted.** An age-restricted video isn't shown to
anyone signed out, gets very little recommendation, carries few or no ads, and won't
play embedded on another site. That's the right home for an unfiltered cast, but it
means the stream can't find its own audience. The Shorts are separate uploads, so
they can be cut from moments with no swearing and no gore, left unrestricted, and do
the finding. Every Short links to the live stream.

**3. Titles and thumbnails per part — recommend building the updater.** The rig ends
the broadcast every 11 hours so YouTube keeps a replay: about **61 parts** over 28
days. With auto-start, every part takes the same default title and thumbnail, so the
replay list becomes 61 identical rows. A small script on the workstation (YouTube
Data API, one OAuth sign-in once) could, at each new part:
- set the title to `Day 9 · 4 alive | 6 AI survivors trapped in a zombie biolab`;
- set a thumbnail drawn from the cast's state (portraits, the dead struck through);
- rename the finished part to `Day 9 · Part 2 · 1 death`.

Each update is 50–100 quota units of the free 10,000 a day, so cost is nothing. It
needs the show to expose its day and who's alive to the rig, a read-only
field the stream token can already reach (the integrating session would add it). Without
it, plan B is a fixed title and you rename replays by hand now and then.

**4. Where the links go — recommend a small public page, `solace.zone/survivorz`.**
solace.zone is an invite-only login screen, so a YouTube viewer who clicks the link
hits a door they can't open. A static page (like `/legal`) would say what the show is,
show the six survivors and the three ways out, link back to the stream, and hold the
**full asset credits**. That last part matters: the show uses at least 31 CC-BY
models (the hazmat suit, sinks, the workbench, the sample kit…). Each needs a credit
and they won't fit in YouTube's 5,000-character description beside everything else.
One line on the page says Solace is a private community and this show is its one
public window. Later, the page could show who's alive from a public endpoint.

**BUILT (2026-11-01):** `client/public/survivorz.html`, served at `/survivorz` by
Caddy's `{path}.html` (no app code, no sign-in, revalidated like `/legal`). The credits
are written into it by `node scripts/survivorz/build-credits.mjs` from the asset
pipeline's own licence records (the props' CREDITS.txt, Rollo's suit, ASSETS.md's
CC BY rows). That's **158 models**, not 31. Rerun it whenever props change; `--check`
says if the page is out of date. The Watch button points at
`youtube.com/@SolaceSurvivorz/live`, the handle Josh got. Live since 2026-11-01.

**5. Art — recommend in-engine renders, not generated images.** The banner, avatar
background, thumbnails and Shorts covers should be frames from the show itself: free,
always true to what the viewer will see, and on-brand. AI-generated key art costs
credits and promises a look the stream doesn't have, which reads as bait. The avatar
is a simple mark drawn as an SVG (no credits either).

**6. Highlights — recommend a clip cutter, with you picking what posts.** The rig
already records hourly MP4s to `D:\solace-data\survivorz-recordings`, but the 600 GB
cap holds only **about 100 hours (~4 days)** at ~6 GB an hour, so clips must be cut
within four days or the footage is gone. A script would read a list of notable
events (death, bite revealed, rescue, ending progress, the vault countdown) with
timestamps, cut each from the recordings with ffmpeg as a 16:9 clip and a 9:16 crop,
and put them in a folder with a list. You pick which post. The event list with
timestamps has to come from the show (the integrating session's code), so this
choice includes asking them for it.

---

## 2. The channel page

**Name:** Solace TV
**Handle:** @SolaceSurvivorz (kept; YouTube lets a handle change twice in 14 days, so
@SolaceTV can follow if it's free and wanted. A show's name in the handle is normal.)
**Category (on the stream):** Gaming, game title left blank. That's where 24/7 sim
streams and "AI agents survive" videos are browsed, and it puts the stream on YouTube's
live gaming shelves.

### Channel picture — "Solace TV" (Josh, 2026-11-01)
**THE CHANNEL IS ABOUT AI-MADE SURVIVOR STORIES, NOT ONE SEASON** (Josh: "i want the
channel to be about AI made survivor stories, i want the channel picture to be Solace TV").
So nothing on the channel page names this season's cast or facility.

`docs/survivorz/youtube/avatar-tv.png` (800×800, from `avatar-tv.html`): Solace's own
speech-bubble ring in the brand's peach→pink with **TV** inside it, on near-black.
`avatar-tv-sizes.png` shows it at 240 / 98 / 48 / 32 px on YouTube's dark and light pages.
(The earlier SZ and stencil-ring drafts stay in the folder, unused.)

### Banner (2560×1440, everything important inside the middle 1546×423)
`docs/survivorz/youtube/banner.png`, from `banner.html`: a bank of camera feeds (the
Survivorz look-test renders, softened so they read as "somewhere dangerous" rather than a
place) under **SOLACE TV** in the brand gradient, **SOLACE SURVIVORZ**, and one line:
*Survival stories made by AI. Live, unscripted, no second chances.* No cast and no
facility names, so it outlives any one season. TVs also see a hazard stripe and a faint
AI SURVIVAL STORIES / SOLACE TV above and below. `node scripts/survivorz/render-youtube-art.mjs`
renders both pictures, plus `banner-crops.png` showing what a TV, a desktop and a phone see.

### Channel description (About, under 1,000 characters)
Written for the channel, not the season. Only the "Now showing" paragraph changes when a
new show starts.

> Solace TV makes survival stories with AI.
>
> Every character is an AI. They talk, plan, argue and decide for themselves, live, and
> nobody steers them. Not us, not chat. When one dies, they're gone for good.
>
> Now showing: Solace Survivorz. Six survivors sealed in an underground biolab full of
> the dead, live around the clock.
>
> Survivors, rules and credits: solace.zone/survivorz
>
> Swearing, crude humour and violence; 18+. The characters and their voices are made by
> AI. They're fictional people.
>
> Made by Solace, a small private community.

### The watermark (Josh, 2026-11-01: "nothing in the way, but just to make sure no one tries and steals my videos")
- **YouTube's own "video watermark" (Studio → Customization → Branding): skip it.**
  YouTube's player draws it on top of the video, so anyone who downloads or rips the
  stream gets a clean copy without it. It's a subscribe button, not protection. It also
  sits in the bottom-right corner, over Rollo's card in the cast row.
- **What protects is a mark burned into the picture, and the stream already has one:**
  the top-right "● LIVE SOLACE SURVIVORZ" tag the overlay draws. Add the handle under it
  in small type at about 60% opacity, `youtube.com/@SolaceSurvivorz`. It stays in the
  same corner, which nothing else on screen uses, so it covers nothing. A re-upload then
  carries your address with it unless someone crops or blurs the corner. That's a one-line
  change to `client/src/survivorz/show/Overlay.svelte` (the `.bug` div), which is the
  integrating session's file, so it's handed to them.
- **Clips and Shorts get the handle burned in by the clip cutter** (they're re-encoded
  anyway, so it costs nothing): small, top-centre on the 9:16 crop, where Shorts' own
  buttons don't sit. Clips are what actually get re-posted on TikTok and Instagram.
- **Re-uploads on YouTube:** the Copyright Match Tool finds them automatically once the
  channel is in the Partner Program. Until then, report one through YouTube's copyright
  form. The local recordings in `D:\solace-data\survivorz-recordings` are your proof of
  authorship.

### Links (About)
1. **Now showing: Solace Survivorz** → `https://solace.zone/survivorz`
2. (only if you want it) **Solace** → `https://solace.zone`

YouTube shows the first link on the channel header, so the current show goes first.
A new season swaps this link and the About's "Now showing" paragraph, nothing else.
Two links, not ten.

### Home tab layout (YouTube has no Twitch-style panels; this is its version)
1. **Featured for everyone:** the live stream (YouTube puts "Live now" first anyway).
2. **Shorts** shelf.
3. **Replays** playlist (every part, newest first).
4. **In Memoriam** playlist (one Short per death).
5. **Meet the survivors** playlist (six pre-launch Shorts).
6. **The endings** playlist (empty until one lands).

---

## 3. The live stream

### Title (100 max; about 60 show in search on a phone)
Plan B, fixed:
> 6 AI Survivors Trapped in a Zombie Biolab — Live 24/7, Permanent Death

With the updater (choice 3):
> Day 9 · 4 alive | 6 AI survivors trapped in a zombie biolab — live 24/7

The hook ("AI survivors", "zombie biolab") comes first because that's what a stranger
searches and what gets cut off last. The show's name lives on the channel and the
thumbnail; it doesn't need the title's best words.

### Thumbnail (1280×720, under 2 MB)
- **Left two-thirds:** a tight in-engine frame. A survivor's face in torchlight, a
  shape behind the glass.
- **Right third:** a black panel listing the six names. The dead are struck through in
  red with their day.
- **Top left:** the red LIVE pill, as the overlay draws it.
- **Big text, three words at most:** `NO RESPAWNS` on the fixed version, `DAY 9 · 4
  LEFT` on the updated one.

### Stream description (5,000 max; the first ~150 characters show before "more")
> Six AI survivors are sealed in an underground biolab full of the dead. Nobody
> controls them. Death is permanent. Live around the clock for four weeks, or until
> nobody is left inside.
>
> THE RULES
> · Every survivor is an AI. They talk, plan, argue, sleep and decide for
> themselves.
> · Nobody steers them. Chat can't change anything that happens.
> · The AI makes their choices: where to go, what to do, who to trust, and
> whether to turn on each other. When one decides something, the screen shows
> what and why. Code only moves their bodies, and makes them fight back or run
> when attacked.
> · There's no host. What you see is the camera, what they say, and the facility's
> own announcements.
> · Death is permanent. Someone new may be found later; nobody comes back.
>
> THE SURVIVORS
> · Rick, a cop whose last day before retirement was day one. He's held the group
> together since.
> · Johanna lost her husband at the start. She keeps going for the others.
> · Dale, a paramedic. Everybody's medic, nobody's friend.
> · Ben never made college ball and still has the chip on his shoulder. He can build
> anything.
> · Sarah is fresh out of college and good at getting people to do things for her.
> · Rollo, the casino champion, crash-landed in an escape pod. He says he's seen
> this company's marks before. Nobody believes him.
>
> THE WAYS OUT
> · The Truth: find out what got loose here and why.
> · The Cure: finish a half-made serum somewhere in the deep labs.
> · Escape: open the vault for 90 seconds and run.
>
> THE CLOCK
> They live on New York time, with no schedule. They sleep when they decide to, and
> nights are the worst hours. Every 11 hours the stream starts a new part so YouTube
> keeps the replay. Missed something? Every part is in the Replays playlist.
>
> Survivors, rules and full credits: https://solace.zone/survivorz
>
> Swearing, crude humour and zombie violence. 18+. The survivors' words and voices
> are AI-generated; they are fictional people.

---

## 4. "A show that never stops": the schedule framing

There's no schedule to post, so say so plainly and give people the three things a
schedule gives them instead:
- **Where things stand:** the day and who's alive, in the title (choice 3), the
  thumbnail, and the banner.
- **When it ends:** "four weeks, or until nobody is left inside." The early ending is
  the reason to keep checking, so it's in every description.
- **What they missed:** the Replays playlist, one Short a day, and a Community post on
  each death.

**Launch:** schedule Day 1 as an *upcoming* stream 3–7 days ahead, so the page
collects "Notify me" clicks while the Meet-the-survivors Shorts go out (one a day).
Confirm during the rehearsal that a scheduled event on the same key still lets every
later part auto-start.

---

## 5. Live chat (it runs 24/7 with nobody watching it)

- **Pinned message (200 max):**
  > Welcome to Site 9. No person controls the survivors — not us, not chat. Slurs,
  > spam and links get removed.
- **Slow mode:** 10 seconds.
- **"Hold potentially inappropriate messages for review":** strict.
- **Blocked words:** a slur list from day one.
- **One or two friends as moderators.** Optional, but a 24/7 chat with no host is
  where trouble starts.
- **Live captions:** on (English auto-captions).

---

## 6. Shorts, highlights and posts

**What feeds them:**
- **Meet the survivors:** six Shorts before launch. A slow in-engine push-in on
  each survivor, a line in their own (local) cloned voice, and their name card.
- **In Memoriam:** every death, the moment and then the card, posted within the
  day. About 4–6 a month at the current rate. Each is also a Community post: the
  card image, one line, and a link to that moment in the replay.
- **The day's moment:** one a day, the strongest thing that happened, picked from the
  clip cutter's list (choice 6). Fights, a bite noticed, a rescue, a confession, an
  argument over the plan.
- **Endings:** a Short and a long cut whenever one lands.
- **Optional daily recap:** a 5–10 minute cut of the day, if you want long-form too.
  This is the most work; skip it at first.

Roughly **40 Shorts** over the month. Each one is clean, unrestricted, under 60
seconds, and pinned with a comment linking to the live stream.

**The vertical cut:** cropping 1920×1080 to 9:16 keeps a 608-pixel-wide slice, scaled
up about 1.8×. That's soft, but fine for Shorts. The director already keeps its
subject near the middle of the frame, so a centre crop mostly works. A sharper option
is a second, vertical camera rendered by the show, but that's show code and a later
ask.

---

## 7. Setting it up in YouTube Studio (in order)

1. Create the channel (brand account) under your Google account; set the name and
   handle.
2. Verify with a phone number and turn on live streaming. YouTube makes you wait
   **24 hours** before the first stream, so do this first.
3. Upload the avatar, banner and watermark (the avatar mark at 150×150, bottom right,
   during the whole video).
4. Fill in the About description and links. Make the playlists (Replays, In Memoriam,
   Meet the survivors, The endings).
5. Stream defaults on the reusable key (STREAM-RIG.md step 3): title, description,
   category Gaming, **Made for kids: No**, **age restriction: Yes**, **altered or
   synthetic content: Yes** (on-brand, since AI is the hook), add to the Replays
   playlist, auto-start ON, auto-stop ON, DVR ON, live chat with the settings from §5.
6. Run the 72-hour rehearsal **unlisted** on this channel, then set its parts to
   private or delete them, so the channel doesn't open with test videos.
7. Post the six Meet-the-survivors Shorts over the week before Day 1, and schedule
   Day 1.

**Not part of this plan, just to know:** money. The Partner Program needs 1,000
subscribers and 4,000 public watch hours. An average of just **6 viewers** across 28
days × 24 hours is 4,032 hours. But age-restricted videos earn little, and YouTube
reviews round-the-clock AI streams under its "inauthentic content" rule, so treat
earnings as unlikely for this show.

## 8. Still to check before launch

- Whether a thumbnail set in Studio carries over to each auto-started part (if not,
  the updater sets it).
- The music: ElevenLabs-generated, licensed for commercial use on the paid plan. Keep
  the plan active through the month. A Content ID claim on a 24/7 stream is unlikely
  but would be disruptive.
- The Renderpeople free bodies' licence (SURVIVORZ.md §14), before anything streams
  publicly.
- Audio loudness: the in-app mix measured about −35 dB mean, quiet for YouTube.
  `loudnorm` on the recorder is noted as the next dial (SURVIVORZ.md §12).
