# The Survivorz control room — Admin Panel → Survivorz → Show

Josh, Nov 3 2026: *"i dont want it to load the show in the show tab if i want to watch it ill go to the survivors
show section in solace. Let make the show tab its on dedicated UI with plenty of easy to use options for
orchestrating the show. lets also add a pop out window to the survivors show so it doesnt take the screen."*

## His answers (the 20 questions)
1. **Layout:** a control room: a run-status strip on top, then cards. No 3D.
2. **While a run goes:** the clock + objectives, survivor cards, a top-down map, and an event log.
3. **No picture** in the tab.
4. **The lineup lives in this tab** (I build it; the character-creator session supplies the characters).
5. **Run levers:** Start / Test / Stop · Pause / Resume / Go now · Restart same / new start. (No hand-typed seed.)
6. **Timing (test runs):** speed 1-8×, jump +5/+15 min, jump to an objective, set the show length.
7. **Survivor levers:** Kill / Down / Revive · Bite · Heal / give an item · Move to a room.
8. **Zombie levers:** spawn N in a room · kill all / kill in a room · the trickle rate · the starting count.
9. **AI:** the on/off switch · engine status + the AI's share · pause the hold (run on code when the AI drops) ·
   nudge a survivor (a thought or goal).
10. **Broadcast:** on air in Solace · YouTube start/stop · the stand-by card · rig health.
11. **Safety:** a REAL show's destructive levers ask first; a test run acts at once.
12. **A real show is the AI's alone:** the testing levers only on test runs.
13. **Pop-out:** the director's cut only.
14. Everyone gets the pop-out.
15. The page behind stops drawing while popped out, with "bring it back".
16. A resizable 16:9 window (1280×720 in a browser; the desktop shell's own native window).
17. **Lineup:** starters · bench + order · max group size · saved presets.
18. **Setup beyond the cast:** where each starts · where the radio part and code hide · or random (as now).
19. **After a run:** a run history list.
20. **Delivery in stages**, each reviewed.

## Stages
1. **Done (Nov 3, fe8231c):** the Show tab is the control room (`watch/ControlRoom.svelte`) with the existing
   levers rehoused; the Survivorz page's Pop out (`lib/popout.ts`, `show/WatchPopout.svelte`, `#survivorz-watch`).
2. **Done (Nov 3):** the live picture (`watch/LivePicture.svelte` - the clock and the objectives, a card per
   survivor, a top-down map with every body on it, the log) and the new levers, a test run's alone and audited
   (`POST /api/admin/survivorz/act`: heal, give, move, put the dead down, the show's length, the tunnel's pace,
   nudge a goal or a thought; the dead at the start on Test run). The hold switch (`POST /api/admin/survivorz/nohold`)
   works on any show. The Stream tab moved into the Show tab, at its foot (Josh: "put all the stuff in the stream
   tab inside the show tab"). (The YouTube title and description were built, then taken out: Josh sets them in
   YouTube Studio.)
3. **Done (Nov 3):** THE LINEUP (`watch/Lineup.svelte`; `GET|POST /api/admin/survivorz/lineup` and
   `…/lineup/preset` save · use · delete, kept in app_kv): who starts, the bench in order, the largest group,
   saved presets. Josh's call on the bench: it FILLS EMPTY SEATS — a run starts with the starters and the bench
   fills the rest in order; nothing changes by itself between runs. THE RUN SETUP's picks on Start or Test run:
   a start room per survivor, the radio part's and the code's spots, or the roll (sim `starts`/`partSpot`/
   `noteSpot`; every roll is still drawn, so a pick moves that and nothing else; a restart keeps them). THE RUN
   HISTORY (`watch/RunHistory.svelte`, `GET /api/admin/survivorz/history`, the last 100 in app_kv): every run that
   ends, is stopped or is restarted — who, who lived, what got done.
4. **Done (Nov 12):** THE REVIEW ROUND (Josh: "bug find, optimize code, more polished UI and easier navigation
   and settings, more control settings and diagnostics"). **Layout:** the strip stays on screen while the page
   scrolls (the run, the stream, the AI, any red check, and Go now / +1 min / Pause / Stop, with what the last
   press did), and under it five sections instead of one long page: Run · Cast · Stream · History · Diagnostics
   (the Run section stays mounted, so the live picture keeps its socket and log). **One reading:**
   `watch/panel.svelte.ts` polls the run, the rig, the AI, the GPU and the show's health checks once (2 s, not
   while the tab is hidden); the header, the control room and the stream card used to poll the same endpoints on
   three clocks. **Diagnostics** (`watch/Diagnostics.svelte`, `ShowStatus.diag`): the tick's cost against its
   100 ms budget, late ticks, who's on the watch socket and what's going out, the saves, the AI by the numbers,
   the show's health checks, and Copy report. **New levers** (`POST …/show`): `wait {minutes}` adds 1-15 min to
   a countdown (never past 30), `save` writes the world now. **Bugs fixed:** a run written to the history twice
   after a restart (two rows with one id crashed the list); Start while a run is going (it answered 200, audited
   a start and un-paused) and Restart / Pause with nothing running (Restart STARTED a numbered show) are refused
   409; a restart mid-countdown dropped the countdown and started the show; one character turned Off threw the
   whole saved lineup away for the default, and the lineup card kept offering them until Start was refused.
   **Left as it is, Josh's call:** the body and spawn levers are hidden on a real show but the server still
   allows them there (`/act` refuses); say the word and they're refused too.
