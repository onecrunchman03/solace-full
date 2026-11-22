<script lang="ts">
  import { onMount } from "svelte";
  import { ui, manageChannel, ackSelectedChannel, closeDrawer } from "../lib/chat.svelte";
  import Sidebar from "./Sidebar.svelte";
  import MessageView from "./MessageView.svelte";
  import Roster from "./Roster.svelte";
  import ChannelSettings from "./ChannelSettings.svelte";
  import PagesPanel from "./PagesPanel.svelte";
  import PageSettings from "./PageSettings.svelte";
  import { pages } from "../lib/pages.svelte";

  // Arriving back on the Chat view counts as seeing the open channel.
  onMount(ackSelectedChannel);

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && ui.mobileDrawer != null) closeDrawer();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="layout"
  class:collapsed={ui.rosterCollapsed}
  class:drawer-channels={ui.mobileDrawer === "channels"}
  class:drawer-members={ui.mobileDrawer === "members"}
  class:browsing={pages.browsing}
>
  <!-- BROWSING PAGES TAKES THE WHOLE VIEW. A channel rail belongs to a page,
       so showing one while you're choosing between pages is showing you the
       insides of a room you haven't picked yet (Josh). Pick a page and the
       rail comes back with that page's channels; click Solace Pages again to
       come back out here. -->
  {#if !pages.browsing}
    <Sidebar />
  {/if}
  <section class="main">
    {#if pages.browsing}
      <PagesPanel />
    {:else}
      <MessageView />
    {/if}
  </section>
  {#if !pages.browsing}
    <Roster />
  {/if}
  {#if ui.mobileDrawer != null}
    <div class="drawer-scrim" onclick={closeDrawer} role="presentation"></div>
  {/if}
</div>

{#if ui.manageChannelId != null}
  <ChannelSettings channelId={ui.manageChannelId} onClose={() => manageChannel(null)} />
{/if}
{#if ui.pageSettingsId != null}
  <PageSettings pageId={ui.pageSettingsId} onClose={() => (ui.pageSettingsId = null)} />
{/if}

<style>
  .layout {
    display: grid;
    grid-template-columns: 240px 1fr 200px;
    height: 100dvh;
  }
  .layout.collapsed {
    grid-template-columns: 240px 1fr 46px;
  }
  /* The page picker is the only thing on screen — both side panels are gone
     from the DOM, so the grid collapses to a single column. */
  .layout.browsing,
  .layout.browsing.collapsed {
    grid-template-columns: 1fr;
  }
  .main {
    min-width: 0;
    min-height: 0;
  }
  .drawer-scrim {
    display: none;
  }
  /* Phone width: the side panels leave the grid and become slide-over
     drawers, toggled from the chat header (see MessageView). */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .layout,
    .layout.collapsed {
      grid-template-columns: 1fr;
      /* Phone mode: the shell's grid row is the height now (a tab bar sits
         below) — 100dvh would push the composer under it. */
      height: 100%;
    }
    /* !important: the roster's own collapsed-state display rule out-specifies
       a plain hide, which used to leak the slim roster rail in BELOW the chat
       on phones. The drawer rules below also carry !important (and win by
       higher specificity) so the slide-overs still open. */
    .layout :global(> aside) {
      display: none !important;
    }
    .layout.drawer-channels :global(> aside:not(.roster)) {
      display: flex !important;
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: min(300px, 84vw);
      z-index: 60;
      box-shadow: 12px 0 40px rgba(0, 0, 0, 0.55);
      border-right: 1px solid var(--line);
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      animation: slide-in-left 0.2s cubic-bezier(0.2, 0.9, 0.3, 1);
    }
    @keyframes slide-in-left {
      from { transform: translateX(-24px); opacity: 0.6; }
      to { transform: none; opacity: 1; }
    }
    @keyframes slide-in-right {
      from { transform: translateX(24px); opacity: 0.6; }
      to { transform: none; opacity: 1; }
    }
    .layout.drawer-members :global(> aside.roster) {
      display: block !important;
      position: fixed;
      right: 0;
      top: 0;
      bottom: 0;
      width: min(280px, 80vw);
      z-index: 60;
      box-shadow: -12px 0 40px rgba(0, 0, 0, 0.55);
      border-left: 1px solid var(--line);
      padding-top: calc(0.75rem + env(safe-area-inset-top));
      padding-bottom: env(safe-area-inset-bottom);
      animation: slide-in-right 0.2s cubic-bezier(0.2, 0.9, 0.3, 1);
    }
    .drawer-scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 55;
      background: rgba(0, 0, 0, 0.5);
    }
  }
</style>
