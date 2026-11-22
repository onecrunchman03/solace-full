<script lang="ts">
  import { onMount } from "svelte";
  import { api, getToken, setToken, type SelfUser } from "./lib/api";
  import Title from "./screens/Title.svelte";
  import Login from "./screens/Login.svelte";
  import Menu from "./screens/Menu.svelte";
  import Game from "./screens/Game.svelte";

  type Screen = "boot" | "title" | "login" | "menu" | "game";
  let screen = $state<Screen>("boot");
  let me = $state<SelfUser | null>(null);
  let chosenDoor = $state(0);

  onMount(async () => {
    // A stored session skips straight past the title on relaunch — the
    // "get back in" path. Network failures keep the token (same rule as the
    // main client); only a real 401/403 clears it.
    if (getToken()) {
      try {
        me = (await api.me()).user;
        screen = "menu";
        return;
      } catch {
        /* fall through to the title */
      }
    }
    screen = "title";
  });

  function onEnter() {
    screen = me ? "menu" : "login";
  }

  function onLoggedIn(user: SelfUser) {
    me = user;
    screen = "menu";
  }

  async function onLogout() {
    try {
      await api.logout();
    } catch {
      /* best effort */
    }
    setToken(null);
    me = null;
    screen = "title";
  }
</script>

{#if screen === "boot"}
  <div class="boot"></div>
{:else if screen === "title"}
  <Title {onEnter} />
{:else if screen === "login"}
  <Login {onLoggedIn} onBack={() => (screen = "title")} />
{:else if screen === "menu" && me}
  <Menu {me} {onLogout} onEnterDoor={(d) => { chosenDoor = d; screen = "game"; }} />
{:else if screen === "game"}
  <Game door={chosenDoor} onExit={() => (screen = "menu")} />
{/if}

<style>
  .boot {
    height: 100%;
    background: var(--void);
  }
</style>
