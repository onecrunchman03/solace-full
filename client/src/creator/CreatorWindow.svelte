<script lang="ts">
  // THE CREATOR IN A WINDOW OF ITS OWN (main.ts #creator; Josh, Nov 3 2026: "allow the character
  // creator to be pop out in its own window for easy multi tasking"). The stored session, no chat
  // socket, no rail: the creator and the house's confirm dialog. Admins only, as in the panel.
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import ConfirmDialog from "../components/ConfirmDialog.svelte";
  import Creator from "./Creator.svelte";

  let state = $state<"checking" | "ok" | "no">("checking");
  onMount(async () => {
    document.title = "Solace — Characters";
    // (the creator wears the show's look: the theme's scenery stands down here, as it does off Chat and DMs)
    document.documentElement.classList.add("casino");
    try {
      const me = await api.me();
      state = me?.user?.isAdmin ? "ok" : "no";
    } catch {
      state = "no";
    }
  });
</script>

{#if state === "ok"}
  <Creator popped />
{:else if state === "no"}
  <p class="gate">Sign in to Solace as the admin in the main window, then open the creator again.</p>
{/if}
<ConfirmDialog />

<style>
  .gate { margin: 40px auto; max-width: 420px; text-align: center; color: var(--ink-soft); }
</style>
