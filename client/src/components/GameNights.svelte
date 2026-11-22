<script lang="ts">
  import { onMount } from "svelte";
  import { api, ApiError } from "../lib/api";
  import { events, loadEvents } from "../lib/events.svelte";
  import { chat } from "../lib/chat.svelte";
  import { session } from "../lib/session.svelte";
  import Avatar from "./Avatar.svelte";

  onMount(() => void loadEvents());

  const me = $derived(session.user?.id ?? -1);
  const isAdmin = $derived(session.user?.isAdmin ?? false);

  let title = $state("");
  let note = $state("");
  let when = $state(""); // datetime-local string
  let err = $state("");

  async function create() {
    err = "";
    const at = new Date(when).getTime();
    if (!title.trim()) { err = "Give it a name."; return; }
    if (!Number.isFinite(at) || at < Date.now()) { err = "Pick a future time."; return; }
    try {
      await api.createEvent(title.trim(), at, note.trim() || undefined);
      title = ""; note = ""; when = "";
      await loadEvents();
    } catch (e) {
      err = e instanceof ApiError ? "Couldn't create that." : "Couldn't create that.";
    }
  }

  async function rsvp(id: number, going: boolean) {
    try { await api.rsvpEvent(id, going); await loadEvents(); } catch { /* */ }
  }
  async function cancel(id: number) {
    try { await api.deleteEvent(id); await loadEvents(); } catch { /* */ }
  }

  function nameOf(id: number): string {
    return chat.members.find((m) => m.id === id)?.displayName ?? "?";
  }
  function fmt(at: number): string {
    return new Date(at).toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  }
  function relative(at: number): string {
    const d = at - Date.now();
    if (d < 0) return "happening now";
    const h = Math.floor(d / 3_600_000);
    if (h < 1) return `in ${Math.max(1, Math.round(d / 60_000))} min`;
    if (h < 48) return `in ${h}h`;
    return `in ${Math.round(h / 24)} days`;
  }
</script>

<div class="nights">
  <div class="inner">
    <header class="head">
      <div class="kicker">🗓️ THE HOUSE CALENDAR 🗓️</div>
      <h1>Game Nights</h1>
      <p class="sub">Call a table. The house reminds everyone 15 minutes before.</p>
    </header>

    {#if err}<div class="note err">{err}</div>{/if}

    <section class="card">
      <div class="card-label">CALL ONE</div>
      <div class="form">
        <input placeholder="Pit night? Blackjack? Movie?" bind:value={title} maxlength="80" />
        <input type="datetime-local" bind:value={when} />
        <input placeholder="Details (optional)" bind:value={note} maxlength="300" />
        <button class="go" onclick={create}>Post it</button>
      </div>
    </section>

    <section class="card">
      <div class="card-label">UPCOMING</div>
      {#if events.loading}
        <p class="muted">Checking the book…</p>
      {:else if events.list.length === 0}
        <p class="muted">Nothing on the calendar. The house is too quiet.</p>
      {:else}
        {#each events.list as ev (ev.id)}
          <div class="ev" class:soon={ev.at - Date.now() < 3_600_000}>
            <div class="ev-when">
              <span class="ev-date">{fmt(ev.at)}</span>
              <span class="ev-rel">{relative(ev.at)}</span>
            </div>
            <div class="ev-body">
              <div class="ev-title">{ev.title}</div>
              {#if ev.note}<div class="ev-note">{ev.note}</div>{/if}
              <div class="ev-people">
                <span class="host">by {nameOf(ev.createdBy)}</span>
                {#if ev.going.length}
                  <span class="going">
                    {#each ev.going as id (id)}
                      {@const m = chat.members.find((x) => x.id === id)}
                      {#if m}<Avatar name={m.displayName} id={m.id} avatar={m.avatar} size={18} profile />{/if}
                    {/each}
                    {ev.going.length} going
                  </span>
                {/if}
              </div>
            </div>
            <div class="ev-act">
              <button class="chip" class:on={ev.going.includes(me)} onclick={() => rsvp(ev.id, true)}>I'm in</button>
              <button class="chip no" class:on={ev.declined.includes(me)} onclick={() => rsvp(ev.id, false)}>Can't</button>
              {#if ev.createdBy === me || isAdmin}
                <button class="chip x" onclick={() => cancel(ev.id)}>✕</button>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </section>
  </div>
</div>

<style>
  .nights {
    height: 100%;
    overflow-y: auto;
    background:
      radial-gradient(900px 420px at 50% 0%, rgba(120, 90, 220, 0.12), transparent 60%),
      radial-gradient(1200px 800px at 50% 110%, rgba(16, 26, 20, 1), rgba(10, 16, 12, 1));
    padding: 46px 20px 60px;
  }
  .inner {
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head { text-align: center; }
  .kicker {
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.3em;
    color: #d8a04c;
  }
  h1 {
    margin: 4px 0 6px;
    font-family: Georgia, serif;
    font-size: 2rem;
    color: #f0d9a8;
  }
  .sub {
    margin: 0;
    color: rgba(240, 230, 210, 0.65);
    font-size: 0.88rem;
  }
  .note.err {
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(190, 60, 50, 0.15);
    border: 1px solid rgba(190, 60, 50, 0.5);
    color: #e8a49b;
    font-size: 0.85rem;
  }
  .card {
    padding: 14px 16px;
    border-radius: 14px;
    background: rgba(12, 20, 15, 0.8);
    border: 1px solid rgba(230, 190, 120, 0.22);
  }
  .card-label {
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    color: rgba(240, 217, 168, 0.7);
    margin-bottom: 10px;
  }
  .form {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }
  .form input {
    padding: 9px 11px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(230, 190, 120, 0.3);
    border-radius: 9px;
    color: #f0e6d2;
    font: inherit;
    font-size: 0.88rem;
  }
  .form input:first-child { grid-column: 1 / -1; }
  .form input:nth-child(3) { grid-column: 1 / -1; }
  .go {
    padding: 9px 20px;
    border: none;
    border-radius: 9px;
    background: linear-gradient(180deg, #f0c96c, #d8a04c);
    color: #241708;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .go:hover { filter: brightness(1.07); }
  .muted { color: rgba(240, 230, 210, 0.5); font-size: 0.85rem; }
  .ev {
    display: flex;
    gap: 12px;
    padding: 11px 8px;
    border-bottom: 1px solid rgba(230, 190, 120, 0.12);
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .ev:last-child { border-bottom: none; }
  .ev.soon { background: rgba(216, 160, 76, 0.06); border-radius: 10px; }
  .ev-when {
    flex: none;
    display: flex;
    flex-direction: column;
    min-width: 118px;
  }
  .ev-date { color: #f0d9a8; font-weight: 700; font-size: 0.84rem; }
  .ev-rel { color: rgba(240, 230, 210, 0.5); font-size: 0.74rem; }
  .ev-body { flex: 1; min-width: 180px; }
  .ev-title { color: #f0e6d2; font-weight: 700; }
  .ev-note { color: rgba(240, 230, 210, 0.65); font-size: 0.82rem; margin-top: 2px; }
  .ev-people {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
    font-size: 0.74rem;
    color: rgba(240, 230, 210, 0.55);
    flex-wrap: wrap;
  }
  .going { display: inline-flex; align-items: center; gap: 3px; }
  .ev-act { display: flex; gap: 6px; align-items: center; }
  .chip {
    padding: 5px 12px;
    border-radius: 999px;
    border: 1px solid rgba(230, 190, 120, 0.3);
    background: rgba(0, 0, 0, 0.3);
    color: rgba(240, 230, 210, 0.75);
    font: inherit;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
  }
  .chip.on { background: rgba(216, 160, 76, 0.25); border-color: #d8a04c; color: #f0d9a8; }
  .chip.no.on { background: rgba(190, 60, 50, 0.25); border-color: #b83a2a; color: #ff9a8a; }
  .chip.x:hover { color: #ff9a8a; border-color: #b83a2a; }
</style>
