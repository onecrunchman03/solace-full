<script lang="ts">
  import { openProfile } from "../lib/nav.svelte";
  import goblin from "../assets/lender-goblin.webp";
  import { isRegular, type BotKind } from "../lib/bots";

  let {
    name,
    id,
    avatar = null,
    size = 32,
    border = null,
    profile = false,
    bot = false,
  }: {
    name: string;
    id: number;
    avatar?: string | null;
    size?: number;
    /** Equipped Emporium border item id (e.g. "border-gilded"), or null. */
    border?: string | null;
    /** Clickable → opens this user's profile (Discord-style). Only set it
     *  where the avatar isn't already inside another button/link. */
    profile?: boolean;
    /** A house bot: Sterling's copper portrait, the goblins' pinstriped
     *  teller, Dr. Voss's station photograph, or a casino regular in their
     *  suit, instead of initials (see lib/bots.ts). `true` reads as Sterling. */
    bot?: boolean | BotKind;
  } = $props();

  const initials = $derived(
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?",
  );

  // Earthy, warm tones to fit the Foundry palette (clay, olive, rust, slate, plum...).
  const COLORS = ["#7c5a3a", "#5f6b3c", "#8a5140", "#4d5b63", "#7a5470", "#6b5a34", "#83603f", "#556355"];
  const color = $derived(COLORS[id % COLORS.length]);
</script>

{#snippet face()}
  {#if bot === "voss"}
    <!-- Dr. Voss: her own station portrait, cropped to the face. -->
    <span class="avatar bot voss {border ?? ''}" style="width:{size}px; height:{size}px">
      <img src="/assets/voss.webp" alt={name} width={size} height={size} />
    </span>
  {:else if typeof bot === "string" && isRegular(bot)}
    <!-- A casino regular: their picture, in their own suit. -->
    <span class="avatar bot regular {border ?? ''}" style="width:{size}px; height:{size}px">
      <img src="/assets/npc/{bot}.webp" alt={name} width={size} height={size} />
    </span>
  {:else if bot === "goblins"}
    <!-- The goblins: their own teller, from the kiosk's portrait. -->
    <span class="avatar bot goblins {border ?? ''}" style="width:{size}px; height:{size}px">
      <img src={goblin} alt={name} width={size} height={size} />
    </span>
  {:else if bot}
    <!-- Sterling: the copper shopkeep, drawn to match the Trader portrait
         (Shop.svelte) — antenna, top hat with its brass band, cyan goggles,
         the brass mustache, the grill mouth. -->
    <span class="avatar bot {border ?? ''}" style="width:{size}px; height:{size}px">
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <circle cx="20" cy="20" r="20" fill="#2a1f16" />
        <path d="M26.4 8.5 L28.6 4.2" stroke="#8a5a28" stroke-width="1.1" stroke-linecap="round" />
        <circle cx="28.9" cy="3.7" r="1.4" fill="#ffd98f" />
        <rect x="12" y="14" width="16" height="15" rx="5" fill="#b87333" stroke="#7a4a1e" stroke-width="1.2" />
        <rect x="13.5" y="4" width="13" height="8" rx="1.2" fill="#4a3118" stroke="#120c06" stroke-width="0.8" />
        <rect x="13.5" y="9.2" width="13" height="1.8" fill="#c9a24a" />
        <rect x="10.5" y="11.2" width="19" height="2.8" rx="1.4" fill="#3d2915" stroke="#120c06" stroke-width="0.8" />
        <circle cx="16.4" cy="19.6" r="3.2" fill="#0f3d42" stroke="#c9a24a" stroke-width="1.1" />
        <circle cx="23.6" cy="19.6" r="3.2" fill="#0f3d42" stroke="#c9a24a" stroke-width="1.1" />
        <circle cx="16.4" cy="19.6" r="1.3" fill="#37e6f2" />
        <circle cx="23.6" cy="19.6" r="1.3" fill="#37e6f2" />
        <path d="M15.6 24.2 Q17.8 25.6 20 24.4 Q22.2 25.6 24.4 24.2" fill="none" stroke="#e0b45c" stroke-width="1" stroke-linecap="round" />
        <rect x="16" y="25.8" width="8" height="2.3" rx="1.1" fill="#f2a93b" />
        <path d="M18 25.8 v2.3 M20 25.8 v2.3 M22 25.8 v2.3" stroke="#7a4a1e" stroke-width="0.7" />
      </svg>
    </span>
  {:else if avatar}
    <img
      class="avatar img {border ?? ''}"
      src={`/avatars/${avatar}`}
      alt={name}
      style="width:{size}px; height:{size}px"
    />
  {:else}
    <span
      class="avatar {border ?? ''}"
      style="width:{size}px; height:{size}px; font-size:{Math.round(size * 0.4)}px; background:{color}"
    >
      {initials}
    </span>
  {/if}
{/snippet}

{#if profile && id > 0}
  <button class="av-link" title="View {name}'s profile" onclick={(e) => { e.stopPropagation(); openProfile(id); }}>
    {@render face()}
  </button>
{:else}
  {@render face()}
{/if}

<style>
  .avatar {
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    color: #f4ede4;
    font-weight: 600;
    flex: none;
    user-select: none;
    line-height: 1;
  }
  .avatar.img {
    object-fit: cover;
    background: var(--panel-2);
  }
  .avatar.bot {
    overflow: hidden;
    background: #2a1f16;
  }
  .avatar.bot svg {
    display: block;
  }
  .avatar.bot.goblins {
    background: #17261c;
  }
  .avatar.bot.goblins img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 50% 18%;
  }
  .avatar.bot.voss {
    background: #10161c;
  }
  /* Her source art is a wide station interior with the figure centre-right;
     the crop is measured to her face, not guessed at from the middle. */
  .avatar.bot.voss img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 61% 14%;
  }
  .avatar.bot.regular img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .av-link {
    display: inline-flex;
    flex: none;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: 50%;
  }
  .av-link:hover {
    outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
    outline-offset: 1px;
  }
</style>
