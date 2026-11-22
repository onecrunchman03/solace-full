<script lang="ts">
  // Your custom sounds + profile banner (Discord-style personal uploads).
  // Lived in Sterling's Emporium originally; moved to Settings → Profile at
  // Josh's request — it's personal kit, not shop stock. Server truth for the
  // slot mapping comes from /api/me/sounds.
  import { onMount } from "svelte";
  import { api, type UserSound } from "../lib/api";
  import { session } from "../lib/session.svelte";

  type SoundSlot = "enter" | "leave";
  const SOUND_SLOT_DEFS: { slot: SoundSlot; icon: string; label: string; hint: string }[] = [
    { slot: "enter", icon: "🔔", label: "Voice entrance sound", hint: "The room hears this when you join voice." },
    { slot: "leave", icon: "👋", label: "Voice leave sound", hint: "The room hears this when you leave." },
  ];
  let mySounds = $state<UserSound[]>([]);
  let busy = $state(false);
  let note = $state<{ kind: "ok" | "err"; text: string } | null>(null);
  let bannerInput = $state<HTMLInputElement | null>(null);
  const soundInputs: Partial<Record<SoundSlot, HTMLInputElement>> = {};

  onMount(() => {
    void (async () => {
      try {
        mySounds = (await api.mySounds()).sounds;
      } catch {
        /* offline */
      }
    })();
  });
  const soundFor = (slot: SoundSlot) => mySounds.find((s) => s.slot === slot);

  async function uploadBannerFile(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 4_000_000) return void (note = { kind: "err", text: "Banners cap at 4 MB." });
    busy = true;
    note = null;
    try {
      await api.uploadBanner(file);
      note = { kind: "ok", text: "Banner set." };
    } catch {
      note = { kind: "err", text: "That image didn't take (PNG/JPEG/GIF/WebP only)." };
    } finally {
      busy = false;
    }
  }

  async function uploadSoundFile(slot: SoundSlot, e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 400_000) return void (note = { kind: "err", text: "Sounds cap at 400 KB — trim it shorter." });
    busy = true;
    note = null;
    try {
      const r = await api.uploadSound(slot, file);
      mySounds = r.sounds;
      note = { kind: "ok", text: "Sound saved." };
    } catch {
      note = { kind: "err", text: "That file didn't take (MP3/OGG/WAV only)." };
    } finally {
      busy = false;
    }
  }

  async function removeCustom(fn: () => Promise<unknown>): Promise<void> {
    busy = true;
    note = null;
    try {
      const r = (await fn()) as { sounds?: UserSound[] };
      if (r.sounds) mySounds = r.sounds;
      note = { kind: "ok", text: "Removed." };
    } catch {
      note = { kind: "err", text: "Couldn't remove that." };
    } finally {
      busy = false;
    }
  }

  function previewSound(file: string): void {
    const a = new Audio(`/sounds/${file}`);
    a.volume = 0.7;
    void a.play().catch(() => {});
  }
</script>

<div class="custom">
  <div class="head">YOUR CUSTOM SOUNDS &amp; BANNER</div>
  <div class="cu-grid">
    <div class="cu-item">
      <span class="cu-label">🖼️ Profile banner</span>
      {#if session.user?.banner}
        <img class="cu-banner" src={`/banners/${session.user.banner}`} alt="Your banner" />
      {:else}
        <span class="cu-empty">No banner uploaded.</span>
      {/if}
      <span class="cu-btns">
        <button class="go" disabled={busy} onclick={() => bannerInput?.click()}>Upload image</button>
        {#if session.user?.banner}
          <button class="link" disabled={busy} onclick={() => void removeCustom(() => api.removeBanner())}>remove</button>
        {/if}
      </span>
      <input bind:this={bannerInput} type="file" accept="image/*" hidden onchange={(e) => void uploadBannerFile(e)} />
    </div>
    {#each SOUND_SLOT_DEFS as def (def.slot)}
      {@const current = soundFor(def.slot)}
      <div class="cu-item">
        <span class="cu-label">{def.icon} {def.label}</span>
        {#if current}
          <span class="cu-sound">
            <button class="link" title="Preview" onclick={() => previewSound(current.file)}>▶ {current.name}</button>
          </span>
        {:else}
          <span class="cu-empty">{def.hint}</span>
        {/if}
        <span class="cu-btns">
          <button class="go" disabled={busy} onclick={() => soundInputs[def.slot]?.click()}>
            {current ? "Replace" : "Upload sound"}
          </button>
          {#if current}
            <button class="link" disabled={busy} onclick={() => void removeCustom(() => api.removeSound(def.slot))}>remove</button>
          {/if}
        </span>
        <input
          bind:this={soundInputs[def.slot]}
          type="file"
          accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav"
          hidden
          onchange={(e) => void uploadSoundFile(def.slot, e)}
        />
      </div>
    {/each}
  </div>
  {#if note}<p class="note {note.kind}">{note.text}</p>{/if}
  <p class="cu-hint">
    MP3 / OGG / WAV up to 400 KB — keep these to a couple of seconds. Soundboard sounds
    live on the 🎛️ button in the voice dock — everyone shares one library there.
  </p>
</div>

<style>
  .custom {
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--line));
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }
  .head {
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    color: var(--ink-dim);
  }
  .cu-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
    gap: 10px;
    margin-top: 8px;
  }
  .cu-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--panel);
    border: 1px solid var(--line);
  }
  .cu-label {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--ink);
  }
  .cu-banner {
    width: 100%;
    height: 56px;
    object-fit: cover;
    border-radius: 8px;
    border: 1px solid var(--line);
  }
  .cu-empty {
    font-size: 0.74rem;
    color: var(--ink-dim);
  }
  .cu-sound .link {
    font-size: 0.8rem;
  }
  .cu-btns {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .cu-hint {
    margin: 8px 0 0;
    font-size: 0.72rem;
    color: var(--ink-dim);
  }
  .go {
    font-size: 0.76rem;
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: color-mix(in srgb, var(--accent) 18%, var(--panel));
    color: var(--ink);
    cursor: pointer;
  }
  .go:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 30%, var(--panel));
  }
  .go:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent);
    font-size: 0.76rem;
    cursor: pointer;
    text-decoration: underline;
  }
  .note {
    margin: 8px 0 0;
    font-size: 0.78rem;
  }
  .note.ok {
    color: var(--ok);
  }
  .note.err {
    color: var(--danger, #d66);
  }
</style>
