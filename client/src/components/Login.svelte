<script lang="ts">
  import { login, loginVerify, register } from "../lib/session.svelte";
  import { ApiError, api } from "../lib/api";
  import { isDesktopShell, isMac } from "../lib/platform";

  type Mode = "login" | "register" | "challenge" | "reset";
  let mode = $state<Mode>("login");
  let username = $state("");
  let displayName = $state("");
  let password = $state("");
  let secret = $state("");
  // Show-what-I'm-typing toggles (Josh, Aug 2026) — per field, never sticky.
  let showPw = $state(false);
  let showSecret = $state(false);
  let showNewPw = $state(false);
  let newPassword = $state("");
  let inviteCode = $state("");
  // THE PAPERWORK: sign-up needs an explicit "I'm 18+ and I agree". The
  // server records it against the account (a click-wrap, with a ledger row).
  let agree = $state(false);
  let error = $state("");
  let notice = $state("");
  let busy = $state(false);
  // Sign-up policy from the server: whether registration is open at all, and
  // whether it needs an invite code. Drives what the register form shows.
  let requireInvite = $state(false);
  let allowRegistration = $state(true);

  $effect(() => {
    api
      .authConfig()
      .then((cfg) => {
        requireInvite = cfg.requireInvite;
        allowRegistration = cfg.allowRegistration;
        if (!allowRegistration && mode === "register") mode = "login";
      })
      .catch(() => {}); // fall back to defaults; the server still enforces the real rule
  });

  function go(m: Mode): void {
    mode = m;
    error = "";
    notice = "";
    if (m !== "challenge") secret = "";
  }

  async function submit(e: Event) {
    e.preventDefault();
    error = "";
    notice = "";
    busy = true;
    try {
      if (mode === "login") {
        const r = await login(username.trim(), password);
        if (r === "challenge") {
          // New sign-in location — the server wants the recovery secret.
          go("challenge");
          notice = "New sign-in location. Enter your recovery secret to continue.";
        }
      } else if (mode === "challenge") {
        await loginVerify(username.trim(), password, secret);
      } else if (mode === "register") {
        if (!agree) {
          error = "You need to be 18 or older and agree to the Terms to create an account.";
          return;
        }
        await register(
          username.trim(),
          displayName.trim() || username.trim(),
          password,
          secret,
          requireInvite ? inviteCode.trim() : undefined,
          true,
        );
      } else if (mode === "reset") {
        await api.resetPassword(username.trim(), secret, newPassword);
        notice = "Password reset. Sign in with your new password.";
        password = "";
        secret = "";
        newPassword = "";
        mode = "login";
      }
    } catch (err) {
      error = err instanceof ApiError ? errorMessage(err) : "Something went wrong";
    } finally {
      busy = false;
    }
  }

  // Friendlier copy for the error codes the server returns.
  function errorMessage(err: ApiError): string {
    switch (err.code) {
      case "invite_required": return "An invite code is required to register.";
      case "invite_invalid": return "That invite code is invalid, used up, or expired.";
      case "registration_disabled": return "Registration is closed.";
      case "invalid_credentials": return "Wrong username or password.";
      case "invalid_secret": return "That recovery secret didn't match. Try again.";
      case "reset_failed": return "Couldn't reset — check the username and recovery secret.";
      case "locked": return `Too many attempts. Try again in about ${Math.ceil((err.data?.retryAfter ?? 60) / 60)} min.`;
      case "rate_limited": return "Too many attempts from here. Wait a bit and retry.";
      case "bad_password":
      case "bad_secret":
      case "bad_username":
        return err.message;
      default: return err.message;
    }
  }

  const title = $derived(
    mode === "login" ? "Sign in to continue"
    : mode === "register" ? "Create your account"
    : mode === "challenge" ? "Verify it's you"
    : "Reset your password",
  );
</script>

<div class="wrap">
  <form class="card" onsubmit={submit}>
    <img class="brand-logo" src="/solace-logo.png" alt="Solace" />
    <p class="sub">{title}</p>

    {#if notice}<p class="notice">{notice}</p>{/if}

    <label>
      Username
      <input bind:value={username} autocomplete="username" required readonly={mode === "challenge"} />
    </label>

    {#if mode === "register"}
      <label>
        Display name
        <input bind:value={displayName} placeholder="(optional)" />
      </label>
    {/if}

    {#if mode === "login" || mode === "register" || mode === "challenge"}
      <label>
        Password
        <span class="pwwrap">
          <input
            type={showPw ? "text" : "password"}
            bind:value={password}
            autocomplete={mode === "register" ? "new-password" : "current-password"}
            required
          />
          <button type="button" class="eye" onclick={() => (showPw = !showPw)} aria-label={showPw ? "Hide password" : "Show password"} title={showPw ? "Hide" : "Show"}>
            {showPw ? "🙈" : "👁"}
          </button>
        </span>
      </label>
    {/if}

    {#if mode === "register"}
      <span class="hint">At least 12 characters with upper &amp; lower case, a number, and a symbol — and not an obvious one.</span>
    {/if}

    {#if mode === "register" || mode === "challenge" || mode === "reset"}
      <label>
        Recovery secret
        <span class="pwwrap">
          <input
            type={showSecret ? "text" : "password"}
            bind:value={secret}
            autocomplete="off"
            placeholder={mode === "register" ? "A few memorable words" : "Your recovery secret"}
            required
          />
          <button type="button" class="eye" onclick={() => (showSecret = !showSecret)} aria-label={showSecret ? "Hide secret" : "Show secret"} title={showSecret ? "Hide" : "Show"}>
            {showSecret ? "🙈" : "👁"}
          </button>
        </span>
      </label>
      {#if mode === "register"}
        <span class="hint">
          Used to verify new sign-ins and to reset a forgotten password — so make it a real phrase,
          a few words you'll remember. Write it down; it can't be recovered.
        </span>
      {/if}
    {/if}

    {#if mode === "reset"}
      <label>
        New password
        <span class="pwwrap">
          <input type={showNewPw ? "text" : "password"} bind:value={newPassword} autocomplete="new-password" required />
          <button type="button" class="eye" onclick={() => (showNewPw = !showNewPw)} aria-label={showNewPw ? "Hide password" : "Show password"} title={showNewPw ? "Hide" : "Show"}>
            {showNewPw ? "🙈" : "👁"}
          </button>
        </span>
      </label>
    {/if}

    {#if mode === "register" && requireInvite}
      <label>
        Invite code
        <input
          bind:value={inviteCode}
          placeholder="From whoever invited you"
          autocapitalize="characters"
          autocomplete="off"
          required
        />
      </label>
    {/if}

    {#if mode === "register"}
      <label class="agree">
        <input type="checkbox" bind:checked={agree} />
        <span>
          I'm 18 or older and I agree to the
          <a href="/legal/terms.html" target="_blank" rel="noopener">Terms of Service</a>,
          <a href="/legal/guidelines.html" target="_blank" rel="noopener">Community Guidelines</a> and
          <a href="/legal/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.
        </span>
      </label>
    {/if}

    {#if error}<p class="error">{error}</p>{/if}

    <button type="submit" disabled={busy || (mode === "register" && !agree)}>
      {busy ? "…"
        : mode === "login" ? "Sign in"
        : mode === "register" ? "Create account"
        : mode === "challenge" ? "Verify & sign in"
        : "Reset password"}
    </button>

    <p class="toggle">
      {#if mode === "login"}
        {#if allowRegistration}
          No account?
          <button type="button" class="link" onclick={() => go("register")}>Create one</button>
          &nbsp;·&nbsp;
        {/if}
        <button type="button" class="link" onclick={() => go("reset")}>Forgot password?</button>
      {:else if mode === "register"}
        Already have an account?
        <button type="button" class="link" onclick={() => go("login")}>Sign in</button>
      {:else}
        <button type="button" class="link" onclick={() => go("login")}>← Back to sign in</button>
      {/if}
    </p>
  </form>

  <!-- Only meaningful in a real browser — the desktop shell IS the app. -->
  {#if !isDesktopShell}
    {#if isMac}
      <a class="get-app" href="/desktop/Solace.dmg" download>🍎 Get the Mac app</a>
    {:else}
      <a class="get-app" href="/desktop/Solace-Setup.exe" download>💻 Get the Windows app</a>
    {/if}
  {/if}
  <p class="legal">
    <a href="/legal/terms.html" target="_blank" rel="noopener">Terms</a> ·
    <a href="/legal/guidelines.html" target="_blank" rel="noopener">Guidelines</a> ·
    <a href="/legal/privacy.html" target="_blank" rel="noopener">Privacy</a> ·
    <a href="/legal/hosting.html" target="_blank" rel="noopener">Hosting</a>
  </p>
</div>

<style>
  .wrap {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 14px;
    padding: 1rem;
  }
  .get-app {
    font-size: 0.78rem;
    color: var(--ink-dim);
    text-decoration: none;
    padding: 5px 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
  }
  .get-app:hover {
    color: var(--ink);
    border-color: var(--accent);
  }
  /* Phone mode: a desktop installer is no use on a phone. */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .get-app {
      display: none;
    }
  }
  .card {
    width: 100%;
    max-width: 340px;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding: 1.75rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
  }
  .brand-logo {
    display: block;
    width: min(220px, 70%);
    margin: 0 0 4px;
  }
  .sub {
    margin: -0.4rem 0 0.4rem;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  .pwwrap {
    position: relative;
    display: flex;
  }
  .pwwrap input {
    flex: 1;
    /* A FLEX ITEM'S AUTOMATIC MINIMUM IS ITS CONTENT WIDTH, and an <input>'s
       content width is its default size=20 plus this padding — so on a narrow
       card the field refuses to shrink and hangs out past the wrapper. The eye
       is positioned against the WRAPPER, so it stays put while the field grows
       out from under it and ends up floating in the middle of the box (Josh's
       screenshot). Measured: no overflow down to ~245px, then 22px at a 220px
       card and 42px at 200px — which is exactly what he saw. min-width:0 lets
       it shrink; overflow is 0 at every width. Same root cause as the
       soundboard pads needing minmax(0, 1fr). */
    min-width: 0;
    padding-right: 2.3rem;
  }
  .eye {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.95rem;
    padding: 4px 6px;
    opacity: 0.6;
  }
  .eye:hover {
    opacity: 1;
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
  input[readonly] {
    opacity: 0.7;
  }
  .hint {
    font-size: 0.72rem;
    color: var(--ink-dim);
    line-height: 1.4;
    margin-top: -0.5rem;
  }
  button[type="submit"] {
    margin-top: 0.4rem;
    padding: 0.6rem;
    background: var(--accent);
    color: var(--accent-ink);
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
  }
  button[type="submit"]:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: 0.85rem;
  }
  .notice {
    margin: 0;
    padding: 0.5rem 0.65rem;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
    border-radius: 8px;
    color: var(--ink);
    font-size: 0.82rem;
  }
  .toggle {
    margin: 0.2rem 0 0;
    font-size: 0.82rem;
    color: var(--ink-soft);
    text-align: center;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
    font-size: inherit;
  }
  .agree {
    flex-direction: row;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.78rem;
    line-height: 1.4;
    color: var(--ink-soft);
  }
  .agree input {
    margin-top: 3px;
    accent-color: var(--accent);
    flex: none;
  }
  .agree a {
    color: var(--accent);
  }
  /* THE OTHER CLICK-WRAP DOOR. This tick and the one on TermsGate are the
     two places consent is actually recorded, and both shipped at 13x13 — the
     smallest targets in the app, on the two screens where the person using
     them has never seen the app before. 22px here, with room around it.
     Unlike the gate's, this label has LINKS in it (the three documents), so
     the box stays the thing you aim at rather than the whole row: a fat-
     fingered tap on the text should never open a legal page in a new tab
     when the person meant to agree. */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .agree {
      align-items: center;
      gap: 0.7rem;
      padding: 6px 0;
      min-height: 44px;
    }
    .agree input {
      margin-top: 0;
      width: 22px;
      height: 22px;
    }
  }
  .legal {
    margin: 0;
    font-size: 0.74rem;
    color: var(--ink-dim);
  }
  .legal a {
    color: var(--ink-dim);
    text-decoration: none;
  }
  .legal a:hover {
    color: var(--ink);
  }
</style>
