# SOLACE SURVIVORZ — the launch checklist (2026-10-31)

Everything below is built, tested and live on solace.zone. SURVIVORZ.md has the detail of each round.

## Settled this round (your "whatever you recommend")

1. **The death rate:** half the dead placed, easier grabs, wounds that clot, a bite that infects 25% of the time.
   Over 16 casts, about half the cast is still alive at the end of week one.
2. **The finale is day 14.** Before it the group never goes into the last stage. From day 14 they push into the Deep
   by the tunnels. **Containment stays shut for good**: lighting it wiped 9 casts in 16 inside a day, and nothing an
   ending needs is in there.
3. **The endings, measured over 16 casts × 28 days:** 8 of 16 casts reach an ending, between day 14 and day 17.
   The truth in 5, the escape in 6 (some get both). 3 casts die out first; 5 live out the month with no ending.
   **The cure (Nov 1, your "make it reachable"):** more experiments in the Deep changed nothing, because the chain
   was broken in four places: the one sample kit was spent on day 1, Science 7 arrives after the Deep's experiments
   are dead, the kit carrier was too far back to reach a fresh kill, and the kit stayed home. All four are fixed. The
   cure now happens in 1 of 16 casts (day 16.6, the first cast to get all three endings). It stays the rarest ending.
4. **Claudia** comes in by herself after a death (see below). Her voice is picked (Nov 1, "composed 3") and on slopbot.

Fixed on the way: the truth could never be reached (the final file wasn't on anyone's menu), a trip to the Deep was
abandoned a step out of the door, and studying paid too little to ever reach Science 7.

## Decided at the pre-flight check (Nov 1)

- **A full 72-hour unlisted rehearsal on YouTube first.** It doubles as the 24-hour stress test.
- **Launch is a fresh start**: after the rehearsal, a new run at day 0 with all six alive.
- **Renderpeople scans: cleared for the stream** (Josh: "we can use them").
- **Claudia comes in by herself**, six sim-hours after a death (`SURVIVORZ_BENCH_HOURS`).
- **Fixed**: a survivor turning mid-vent no longer lies inside the wall; a sample case on a dead carrier is now
  worth going back for.
- **A daily summary**: Sterling DMs you at 9am Eastern while the show runs.
- **The house is quiet for the month**: Sterling, Dr. Ada and the goblins on scripted lines, the casino regulars off.

## Done (Nov 1)

YouTube live enabled, the stream key in `.env` with its defaults set, the stream task registered (with the stop
flag, so it can't go live by itself), Windows Update paused, automatic sign-in on, show mode on, slopbot's ears off,
`ROLLO_LIVE=0` and `NPC_ENGINE_RED_MIN=5` on the R220, the house's AI switched off.

## The rehearsal (72 hours, unlisted)

1. YouTube Studio: set the stream key's default visibility to **Unlisted**.
2. Reboot the workstation (the compositor grows over a long uptime; it should come back signed in by itself).
3. Admin Panel → Survivorz → Show → **Start**, then `stream-task.ps1 -Start`.
4. Watch it on YouTube for the first hour (phone too), then let it run. Sterling DMs you if anything goes red,
   and the 9am summary each morning.
5. What it has to show: 60 fps held, voices and the model inside their times, GPU memory flat on both cards
   (`assets/downloads/survivorz/stream/streamer-*.log.csv`, `mem_mib`), and YouTube's 11-hour split starting
   and ending each part by itself.

## Launch day

1. `stream-task.ps1 -Stop` and Admin Panel → Show → **Stop**, then **Reset** for a fresh run.
2. YouTube Studio: visibility back to **Public** (title, description, thumbnail).
3. Reboot the workstation.
4. Admin Panel → Show → **Start**, then `stream-task.ps1 -Start`.

Afterwards, put the house back (SURVIVORZ.md §11 "After the show"): the house's AI switch on, `ROLLO_LIVE`,
`NPC_ENGINE_RED_MIN` removed, slopbot's ears, `solace-gpu.ps1 -CasinoMode`, Windows Update.

**The 3-minute check** (a recording to a file, no YouTube):
`set SURVIVORZ_RTMP=D:\tmp\part-{n}.flv& node scripts\survivorz\streamer.mjs 3` — it should end
"1 session(s), 0 restart(s)" with about 130 MB written.

## Already done for you

- The stream token is set on both ends (the R220 and the workstation's `.env`).
- A restart or a deploy resumes the same world within seconds.
- Admin Panel → Survivorz → Stream shows the rig's health, and Sterling DMs you if it goes red.
- The rig now replaces the browser when the page stops answering (the Oct 31 out-of-memory run sat on a still frame
  for three minutes because nothing noticed). Measured after the Nov 1 reboot with the model loaded: 1080p, 60 fps
  steady after the first minute, sound at −16 dB with peaks at −1.5 dB.
