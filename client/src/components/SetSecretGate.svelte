<script lang="ts">
  // Shown to any logged-in account that has no recovery secret yet (existing
  // accounts from before the security update). It's a required, un-dismissable
  // step: setting the secret is what unlocks new-network protection and
  // self-service password reset for that account.
  import { api, ApiError } from "../lib/api";
  import { refreshSelf } from "../lib/session.svelte";

  let currentPassword = $state("");
  let secret = $state("");
  let error = $state("");
  let busy = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    error = "";
    busy = true;
    try {
      const { user } = await api.setSecret(currentPassword, secret);
      refreshSelf(user);
    } catch (err) {
      error =
        err instanceof ApiError
          ? err.code === "wrong_password"
            ? "That's not your current password."
            : err.message
          : "Something went wrong";
    } finally {
      busy = false;
    }
  }
</script>

<div class="scrim">
  <form class="card" onsubmit={submit}>
    <h2>Set a recovery secret</h2>
    <p class="lead">
      Solace now protects accounts with a recovery secret — a memorable phrase used to verify
      sign-ins from a new place and to reset a forgotten password. Set yours to continue.
    </p>

    <label>
      Current password
      <input type="password" bind:value={currentPassword} autocomplete="current-password" required />
    </label>
    <label>
      Recovery secret
      <input type="password" bind:value={secret} autocomplete="off" placeholder="A few memorable words" required />
    </label>
    <p class="hint">At least 12 characters, and a real phrase rather than one word — it can reset your password, so it should be as hard to guess as one. Write it down; it can't be recovered.</p>

    {#if error}<p class="error">{error}</p>{/if}

    <button type="submit" disabled={busy}>{busy ? "…" : "Save & continue"}</button>
  </form>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 10000); /* above the theme atmosphere (9990) */
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(3px);
  }
  .card {
    width: 100%;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 1.75rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--ink);
  }
  .lead {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.45;
    color: var(--ink-soft);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  input {
    padding: 0.55rem 0.65rem;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    font-size: 0.95rem;
  }
  input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .hint {
    margin: -0.3rem 0 0;
    font-size: 0.72rem;
    color: var(--ink-dim);
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: 0.85rem;
  }
  button {
    margin-top: 0.3rem;
    padding: 0.6rem;
    background: var(--accent);
    color: var(--accent-ink);
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
