<script lang="ts">
  import { api, setToken, ApiError, type SelfUser } from "../lib/api";

  let { onLoggedIn, onBack }: { onLoggedIn: (u: SelfUser) => void; onBack: () => void } = $props();

  let username = $state("");
  let password = $state("");
  let secret = $state("");
  let needSecret = $state(false); // new-network challenge (same flow as Solace)
  let busy = $state(false);
  let error = $state("");

  async function submit(e: Event) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = "";
    try {
      const r = needSecret
        ? await api.verify(username.trim(), password, secret)
        : await api.login(username.trim(), password);
      if (r.challenge === "secret") {
        needSecret = true;
        return;
      }
      if (!r.token || !r.user) {
        error = "Unexpected reply from the server.";
        return;
      }
      if (r.mustSetSecret) {
        error = "This account needs a recovery secret — open Solace itself once to set it, then come back.";
        return;
      }
      setToken(r.token);
      onLoggedIn(r.user);
    } catch (err) {
      if (err instanceof ApiError) {
        error =
          err.code === "invalid_login" ? "Wrong username or password."
          : err.code === "bad_secret" ? "That recovery secret didn't match."
          : err.code === "locked" ? "Account temporarily locked — too many attempts. Wait a bit."
          : err.code === "rate_limited" ? "Slow down — too many attempts from this network."
          : err.code === "suspended" ? "This account is suspended."
          : err.message || "Login failed.";
      } else {
        error = "Can't reach the Solace server — is it up?";
      }
    } finally {
      busy = false;
    }
  }
</script>

<div class="wrap">
  <form class="card" onsubmit={submit}>
    <h1>CLEARANCE CHECK</h1>
    <p class="sub">Sign in with your Solace account. Same door, different building.</p>

    <label>
      <span>Username</span>
      <input bind:value={username} autocomplete="username" disabled={needSecret} />
    </label>
    <label>
      <span>Password</span>
      <input type="password" bind:value={password} autocomplete="current-password" disabled={needSecret} />
    </label>

    {#if needSecret}
      <label class="challenge">
        <span>Recovery secret</span>
        <input type="password" bind:value={secret} autocomplete="off" />
        <small>New network detected — Solace wants your recovery secret once.</small>
      </label>
    {/if}

    {#if error}<p class="err">{error}</p>{/if}

    <button class="go" disabled={busy || !username || !password || (needSecret && !secret)}>
      {busy ? "Checking…" : needSecret ? "Verify" : "Enter"}
    </button>
    <button type="button" class="back" onclick={onBack}>← back</button>
  </form>
</div>

<style>
  .wrap {
    height: 100%;
    display: grid;
    place-items: center;
    background:
      radial-gradient(ellipse 70% 55% at 50% 115%, rgba(201, 178, 106, 0.1), transparent 70%),
      var(--void);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: min(360px, 92vw);
    padding: 28px 26px 20px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 4px;
  }
  h1 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.3em;
    color: var(--yellow);
  }
  .sub {
    margin: -6px 0 6px;
    font-size: 0.78rem;
    color: var(--ink-dim);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  input {
    padding: 9px 10px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 3px;
    color: var(--ink);
    font-size: 0.95rem;
  }
  input:focus {
    outline: none;
    border-color: var(--yellow);
  }
  .challenge small {
    text-transform: none;
    letter-spacing: 0;
    color: var(--ink-dim);
  }
  .err {
    margin: 0;
    font-size: 0.8rem;
    color: var(--danger);
  }
  .go {
    margin-top: 4px;
    padding: 10px;
    background: var(--yellow);
    border: none;
    border-radius: 3px;
    color: #171204;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .go:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .go:not(:disabled):hover {
    background: var(--yellow-hot);
  }
  .back {
    align-self: center;
    background: none;
    border: none;
    color: var(--ink-dim);
    font-size: 0.75rem;
    cursor: pointer;
  }
  .back:hover {
    color: var(--ink-soft);
  }
</style>
