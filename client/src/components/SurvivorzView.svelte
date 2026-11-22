<script lang="ts">
  // SOLACE SURVIVORZ — the show's own place on the rail (Josh, Nov 3 2026: "move the on air solace
  // survivorz watch button to its own section … instead of being in the casino page"). On air: a Watch
  // button that mounts the show's director's cut full screen (show/Show.svelte `watch` — a seat with no
  // body and no levers). Off air: when it's back, and the YouTube channel. The 3D broadcast needs a
  // computer; a phone gets the channel link instead.
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { phone } from "../lib/phone.svelte";
  import { openPopout, watchClosed, type Popped } from "../lib/popout";

  type OnAir = Awaited<ReturnType<typeof api.survivorzOnAir>>;
  let onAir = $state<OnAir | null>(null);
  let watching = $state(false);
  // POPPED OUT (Nov 3 2026): the show plays in its own window and this page draws nothing 3D meanwhile
  let popped = $state<Popped | null>(null);
  let popErr = $state("");
  let stopWatch = (): void => {};
  async function popOut(): Promise<void> {
    popErr = "";
    try {
      const p = await openPopout("#survivorz-watch", { name: "solace-survivorz", width: 1280, height: 720 });
      watching = false;
      popped = p;
      stopWatch = watchClosed(p, () => { popped = null; load(); });
    } catch (e) { popErr = String((e as Error)?.message ?? e); }
  }
  function bringBack(): void {
    stopWatch();
    popped?.win?.close();
    popped = null;
    watching = true;
  }
  const YOUTUBE = "https://www.youtube.com/@SolaceSurvivorz";

  const load = (): void => { void api.survivorzOnAir().then((r) => (onAir = r)).catch(() => {}); };
  onMount(() => {
    load();
    const t = setInterval(() => { if (!watching) load(); }, 30_000);
    return () => { clearInterval(t); stopWatch(); };
  });
</script>

{#if watching}
  <div class="seat">
    {#await import("../survivorz/show/Show.svelte")}
      <div class="tuning"><span>tuning in…</span></div>
    {:then M}
      <M.default watch onExit={() => { watching = false; load(); }} onPopout={popOut} />
    {:catch}
      <div class="tuning">
        <span>The broadcast didn't load. Refresh and try again.</span>
        <button onclick={() => (watching = false)}>Back</button>
      </div>
    {/await}
  </div>
{:else}
  <div class="page">
    <section class="hero" class:live={onAir?.onAir}>
      <div class="glow"></div>
      <div class="inner">
        <p class="kicker">{onAir?.onAir ? "● ON AIR NOW" : onAir?.test ? "TEST RUN · ONLY YOU" : "OFF AIR"}</p>
        <h1>SOLACE SURVIVORZ</h1>
        <p class="tag">Survivors, a map full of the dead, and objectives to finish. The AI decides who lives.</p>
        {#if onAir?.onAir}
          <p class="what">
            {onAir.runNo ? `Run #${onAir.runNo}` : "Live"}{onAir.map ? ` · ${onAir.map}` : ""}{onAir.watching ? ` · ${onAir.watching} watching` : ""}
          </p>
          {#if phone.on}
            <p class="note">The live broadcast needs a computer. On a phone, watch it on YouTube.</p>
            <a class="cta" href={YOUTUBE} target="_blank" rel="noopener">Watch on YouTube ▸</a>
          {:else if popped}
            <p class="note">Playing in its own window.</p>
            <div class="row">
              <button class="cta" onclick={bringBack}>Bring it back here</button>
              {#if popped.win}<button class="cta ghost" onclick={() => popped?.win?.focus()}>Show the window</button>{/if}
            </div>
          {:else}
            <div class="row">
              <button class="cta" onclick={() => (watching = true)}>Watch live ▸</button>
              <button class="cta ghost" onclick={popOut} title="Watch in its own window">Pop out ⧉</button>
            </div>
            {#if popErr}<p class="note err">{popErr}</p>{/if}
          {/if}
        {:else if onAir?.adminView}
          <!-- THE ADMIN'S OWN VIEW: a test run (or a show not on air yet) — only the admin is told it exists -->
          <p class="what">
            {onAir.walk ? "You are walking a map" : onAir.test ? "A test run is going" : onAir.runNo ? `Run #${onAir.runNo} is running, off air` : "A run is going, off air"}{onAir.map ? ` · ${onAir.map}` : ""}
          </p>
          <p class="note">Only you can see it. Members still see "off air".</p>
          {#if phone.on}
            <p class="note">The broadcast needs a computer.</p>
          {:else if popped}
            <p class="note">Playing in its own window.</p>
            <div class="row">
              <button class="cta" onclick={bringBack}>Bring it back here</button>
              {#if popped.win}<button class="cta ghost" onclick={() => popped?.win?.focus()}>Show the window</button>{/if}
            </div>
          {:else}
            <div class="row">
              <button class="cta" onclick={() => (watching = true)}>{onAir.walk ? "Watch your walk ▸" : onAir.test ? "Watch the test run ▸" : "Watch ▸"}</button>
              <button class="cta ghost" onclick={popOut} title="Watch in its own window">Pop out ⧉</button>
            </div>
            {#if popErr}<p class="note err">{popErr}</p>{/if}
          {/if}
        {:else if onAir}
          <p class="what">Nothing's running right now. When a run goes on air, it's here.</p>
          <a class="cta ghost" href={YOUTUBE} target="_blank" rel="noopener">The YouTube channel ▸</a>
        {:else}
          <p class="what">Checking…</p>
        {/if}
      </div>
    </section>

    <section class="facts">
      <div class="fact"><b>Live in Solace</b><span>The same broadcast as YouTube, with the director's camera. You see the show; nobody sees you.</span></div>
      <div class="fact"><b>On YouTube</b><span>Every run streams to <a href={YOUTUBE} target="_blank" rel="noopener">@SolaceSurvivorz</a>, with replays.</span></div>
      <div class="fact"><b>Nothing is scripted</b><span>The map, the objectives and the dead are set up. What the survivors do is up to them.</span></div>
    </section>
  </div>
{/if}

<style>
  .page { height: 100%; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 18px; background: radial-gradient(ellipse at 50% -20%, #1d2a17 0%, #0b0d0a 55%) #0b0d0a; color: #e7ece2; }
  .hero { position: relative; overflow: hidden; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08); background: linear-gradient(160deg, #141a11, #0c0e0b); min-height: 300px; display: grid; place-items: center; text-align: center; }
  .glow { position: absolute; inset: -40%; background: radial-gradient(circle at 50% 60%, rgba(120, 170, 70, 0.16), transparent 55%); pointer-events: none; }
  .hero.live { border-color: rgba(255, 77, 66, 0.35); }
  .hero.live .glow { background: radial-gradient(circle at 50% 60%, rgba(255, 77, 66, 0.16), transparent 55%); }
  .inner { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 36px 20px; max-width: 640px; }
  .kicker { margin: 0; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.22em; color: #8e9a86; }
  .live .kicker { color: #ff4d42; animation: blink 1.6s ease-in-out infinite; }
  @keyframes blink { 50% { opacity: 0.55; } }
  h1 { margin: 0; font-size: clamp(1.8rem, 5vw, 3rem); letter-spacing: 0.12em; font-weight: 900; color: #f2f6ee; text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6); }
  .tag { margin: 0; color: #b6c0ae; font-size: 1rem; }
  .what { margin: 6px 0 0; color: #dfe6d8; font-weight: 600; }
  .note { margin: 0; color: #9aa592; font-size: 0.88rem; }
  .cta { margin-top: 10px; display: inline-block; padding: 12px 26px; border-radius: 999px; border: 0; background: #d23a2f; color: #fff; font: inherit; font-weight: 800; letter-spacing: 0.06em; text-decoration: none; cursor: pointer; box-shadow: 0 6px 24px rgba(210, 58, 47, 0.35); }
  .cta:hover { filter: brightness(1.1); }
  .row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .note.err { color: #ff8a80; }
  .cta.ghost { background: transparent; border: 1px solid rgba(255, 255, 255, 0.25); box-shadow: none; color: #e7ece2; font-weight: 700; }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .fact { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.07); background: rgba(255, 255, 255, 0.025); }
  .fact b { font-size: 0.82rem; letter-spacing: 0.08em; text-transform: uppercase; color: #c7d2bd; }
  .fact span { color: #9aa592; font-size: 0.9rem; line-height: 1.4; }
  .fact a { color: #e7ece2; }
  .seat { position: fixed; inset: 0; z-index: var(--z-modal); background: #000; display: flex; }
  .tuning { flex: 1; display: grid; place-content: center; gap: 12px; color: #cfd6dc; text-align: center; }
  .tuning button { background: #1c2024; color: #dfe5ea; border: 1px solid #333a40; border-radius: 6px; padding: 6px 14px; font: inherit; cursor: pointer; }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) { .page { padding: 14px; } .inner { padding: 28px 14px; } }
</style>
