<script lang="ts">
  // THE REROLL — the fourth ending (Josh, Sep 2026): walk away from the grave
  // (or the goblins' cell) and start again as a stranger, WITHOUT begging an
  // admin for a fresh invite code. The shut-out session token is the proof of
  // standing; the server accepts it in place of a code. Shared by Wake.svelte
  // and Cell.svelte — same form, different framing copy from the parent.
  import { reroll } from "../lib/session.svelte";
  import { ApiError } from "../lib/api";

  let { note }: { note: string } = $props();

  let open = $state(false);
  let username = $state("");
  let password = $state("");
  let secret = $state("");
  let busy = $state(false);
  let err = $state("");

  const WORDS: Record<string, string> = {
    bad_username: "that username won't do",
    bad_password: "that password is too weak",
    bad_secret: "that recovery phrase is too weak",
    username_taken: "that name is already taken",
    invite_required: "the server didn't accept this door — sign in again and retry",
    rate_limited: "too many tries — give it a minute",
  };

  async function go(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    busy = true;
    err = "";
    try {
      const name = username.trim();
      await reroll(name, name, password, secret);
      // Success replaces the session — the app mounts as the new account.
    } catch (ex) {
      err = ex instanceof ApiError ? (ex.message && ex.message !== ex.code ? ex.message : WORDS[ex.code] ?? "that didn't go through — try again") : "that didn't go through — try again";
      busy = false;
    }
  }
</script>

<div class="over">
  {#if !open}
    <button class="opener" onclick={() => (open = true)}>start over as a stranger</button>
  {:else}
    <p class="note">{note}</p>
    <form class="form" onsubmit={go}>
      <input bind:value={username} placeholder="new username" autocomplete="off" maxlength="32" />
      <input bind:value={password} type="password" placeholder="new password (12+ chars)" autocomplete="new-password" />
      <input bind:value={secret} type="password" placeholder="recovery phrase (12+ chars)" autocomplete="off" />
      <div class="row">
        <button class="do" type="submit" disabled={busy || !username.trim() || !password || !secret}>
          {busy ? "…" : "begin a new life"}
        </button>
        <button class="never" type="button" disabled={busy} onclick={() => (open = false)}>never mind</button>
      </div>
    </form>
    {#if err}<p class="err">{err}</p>{/if}
  {/if}
</div>

<style>
  .over {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .note {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.5;
    color: #8d7d78;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  input {
    font: inherit;
    font-size: 0.88rem;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.35);
    color: inherit;
  }
  input:focus {
    outline: none;
    border-color: rgba(232, 195, 60, 0.55);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  button {
    font: inherit;
    cursor: pointer;
    border-radius: 8px;
    padding: 8px 14px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .opener {
    align-self: flex-start;
    font-size: 0.8rem;
    background: none;
    border-style: dashed;
    color: #a99a94;
  }
  .opener:hover {
    color: #e8ddd6;
    border-color: rgba(232, 195, 60, 0.5);
  }
  .do {
    background: rgba(232, 195, 60, 0.12);
    border-color: rgba(232, 195, 60, 0.5);
    color: #e8c33c;
  }
  .do:hover:not(:disabled) {
    background: rgba(232, 195, 60, 0.2);
  }
  .never {
    background: none;
    border: none;
    font-size: 0.8rem;
    color: #8d7d78;
  }
  .err {
    margin: 0;
    font-size: 0.82rem;
    color: #e8a33c;
  }
</style>
