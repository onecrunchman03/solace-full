<script lang="ts">
  import { api, ApiError, type SessionRow, type LoginEvent } from "../lib/api";
  import { ask } from "../lib/confirm.svelte";
  import { session, refreshSelf, logout } from "../lib/session.svelte";
  import { chat } from "../lib/chat.svelte";
  import { prefs, setTheme, setFont, setScale, setKeybind, setReadReceipts, THEMES, FONTS, SCALES, DEFAULT_SCALE, KEYBIND_ACTIONS, type ThemeId, type FontId } from "../lib/prefs.svelte";
  import { voice, refreshDevices, rediscoverDevices, canPickOutput, setMic, setOutput, toggleNeuralNS, togglePtt, setMicGain, setMicGate, setMasterVolume, setSoundboardVolume, startMicMeter, stopMicMeter, STREAM_PRESETS, setStreamQuality, setStreamFps, streamMbps, type StreamQuality, type StreamFps } from "../lib/voice.svelte";
  import { getSfxVolume, setSfxVolume, playSfx } from "../lib/sfx";

  // App-sounds level (game SFX master volume; per-device, lives in sfx.ts).
  let sfxVol = $state(getSfxVolume());
  import { isDesktopShell, isMac } from "../lib/platform";
  import { emporium, loadEmporium, ownsTheme } from "../lib/emporium.svelte";
  import { notify, setNotifyEnabled } from "../lib/notify.svelte";
  import { alerts, ackAll } from "../lib/alerts.svelte";
  import { shell, shellHasAlerts, shellVersion } from "../lib/platform";
  import {
    display, setDisplayMode, DISPLAY_MODES, canBorderless, canFullscreen,
  } from "../lib/display.svelte";
  import { openMarket } from "../lib/nav.svelte";
  import Avatar from "./Avatar.svelte";
  import CustomUploads from "./CustomUploads.svelte";

  let { onClose }: { onClose: () => void } = $props();

  type Tab = "profile" | "appearance" | "display" | "voice" | "security";
  let tab = $state<Tab>("profile");

  // Launch-at-startup lives in the SHELL (registry / LaunchAgent), so its
  // true state is read from there whenever the Profile tab opens (startup +
  // notifications live there since the Aug 2026 settings rework).
  let autostart = $state(false);
  $effect(() => {
    if (tab === "profile" && shellHasAlerts) void shell.getAutostart().then((v) => (autostart = v));
  });
  async function toggleAutostart(): Promise<void> {
    autostart = await shell.setAutostart(!autostart);
  }

  // REDISCOVER: a fresh ask for the microphone and a re-read of the lists.
  let finding = $state(false);
  let found = $state("");
  async function rediscover(): Promise<void> {
    finding = true;
    found = "";
    const r = await rediscoverDevices();
    finding = false;
    found = r.ok
      ? `Found ${r.mics} microphone${r.mics === 1 ? "" : "s"}${canPickOutput ? ` and ${r.outputs} output${r.outputs === 1 ? "" : "s"}` : ""}.`
      : r.reason === "denied"
        ? isMac
          ? "Solace isn't allowed to use the microphone. Open System Settings › Privacy & Security › Microphone, switch Solace on, then quit Solace and open it again."
          : "The microphone is blocked for Solace. Allow it in your browser's site settings, then try again."
        : r.reason === "none"
          ? "No microphone found. If it's a Bluetooth headset, check it's connected to this computer (not your phone), then try again."
          : "This app can't reach your devices right now.";
    if (!r.ok) found += ` (${r.detail})`;
  }

  // Populate device lists when the Voice tab opens (labels appear once the
  // mic permission has ever been granted on this machine), and run the live
  // mic meter only while the tab is showing — torn down on close.
  $effect(() => {
    if (tab === "voice") {
      void refreshDevices();
      void startMicMeter();
      return () => stopMicMeter();
    }
  });

  // ---- keybind capture ----
  let capturing = $state<string | null>(null); // action id being rebound
  function onCaptureKey(e: KeyboardEvent) {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      capturing = null;
      return;
    }
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return; // wait for the real key
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    setKeybind(capturing, parts.join("+"));
    capturing = null;
  }

  const me = $derived(session.user);

  // Premium themes need ownership state from the Emporium.
  $effect(() => {
    if (tab === "appearance" && emporium.loading) void loadEmporium();
  });
  function visitSterling(): void {
    onClose();
    openMarket("shop");
  }

  // ---- Profile tab ----
  let draftName = $state(session.user?.displayName ?? "");
  let draftBio = $state("");
  let bioLoaded = $state(false);
  let savingProfile = $state(false);
  let profileNote = $state<{ kind: "ok" | "err"; text: string } | null>(null);

  // The bio isn't on the session user (profile-only) — fetch it once on open.
  $effect(() => {
    if (!bioLoaded && me) {
      api
        .profile(me.id)
        .then((p) => {
          draftBio = p.bio ?? "";
          bioLoaded = true;
        })
        .catch(() => {
          bioLoaded = true; // editable from blank; save still works
        });
    }
  });

  async function saveProfile() {
    const name = draftName.trim();
    if (!name) {
      profileNote = { kind: "err", text: "Display name can’t be empty." };
      return;
    }
    savingProfile = true;
    profileNote = null;
    try {
      const res = await api.updateProfile({ displayName: name, bio: draftBio.trim() });
      if (session.user) {
        session.user = { ...session.user, displayName: res.user.displayName };
      }
      draftBio = res.bio ?? "";
      profileNote = { kind: "ok", text: "Profile saved." };
    } catch {
      profileNote = { kind: "err", text: "Couldn’t save your profile." };
    } finally {
      savingProfile = false;
    }
  }

  // ---- Avatar ----
  let fileInput = $state<HTMLInputElement>();
  let uploading = $state(false);

  async function onFilePicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 2_000_000) {
      profileNote = { kind: "err", text: "Image must be under 2 MB." };
      return;
    }
    uploading = true;
    profileNote = null;
    try {
      const { avatar } = await api.uploadAvatar(file);
      if (session.user) session.user = { ...session.user, avatar };
    } catch {
      profileNote = { kind: "err", text: "Upload failed — use a PNG, JPEG, GIF, or WebP under 2 MB." };
    } finally {
      uploading = false;
    }
  }

  async function removePhoto() {
    uploading = true;
    profileNote = null;
    try {
      await api.removeAvatar();
      if (session.user) session.user = { ...session.user, avatar: null };
    } catch {
      profileNote = { kind: "err", text: "Couldn’t remove the photo." };
    } finally {
      uploading = false;
    }
  }

  // ---- Legacy (epitaph + will) ----
  let epitaph = $state(session.user?.epitaph ?? "");
  let willId = $state<number | null>(session.user?.willBeneficiaryId ?? null);
  let savingLegacy = $state(false);
  let legacyNote = $state<{ kind: "ok" | "err"; text: string } | null>(null);
  const heirs = $derived(
    chat.members.filter((m) => m.id !== session.user?.id && !m.disabled),
  );

  async function saveLegacy() {
    savingLegacy = true;
    legacyNote = null;
    try {
      const r = await api.updateLegacy({ epitaph: epitaph.trim() || null, willBeneficiaryId: willId });
      if (session.user) session.user = { ...session.user, epitaph: r.epitaph, willBeneficiaryId: r.willBeneficiaryId };
      legacyNote = { kind: "ok", text: "Your affairs are in order." };
    } catch {
      legacyNote = { kind: "err", text: "Couldn’t save your legacy." };
    } finally {
      savingLegacy = false;
    }
  }

  // ---- Security tab ----
  let pwCurrent = $state("");
  let pwNext = $state("");
  let pwConfirm = $state("");
  let changingPw = $state(false);
  let pwNote = $state<{ kind: "ok" | "err"; text: string } | null>(null);

  // ---- Your own sessions + sign-in history (Aug 2026) ----
  // Deliberately member-facing rather than admin-only: the person best placed
  // to notice a session they never created is the account's owner, and asking
  // them to go through Josh for it just means nobody looks.
  let mySessions = $state<SessionRow[]>([]);
  let mySignins = $state<LoginEvent[]>([]);
  let sessBusy = $state(false);
  let sessNote = $state<{ kind: "ok" | "err"; text: string } | null>(null);
  const SELF_OUTCOMES: Record<string, string> = {
    ok: "signed in",
    register: "account created",
    challenged: "asked for your recovery secret (new place)",
    challenge_passed: "verified from a new place",
    bad_password: "wrong password",
    bad_secret: "wrong recovery secret",
    locked: "blocked — too many attempts",
    suspended: "suspended",
    rate_limited: "too many attempts, slowed down",
    reset_ok: "password reset with your secret",
    reset_failed: "failed password reset",
    password_changed: "password changed",
    secret_changed: "recovery secret changed",
  };
  const SELF_GOOD = new Set(["ok", "register", "challenge_passed", "password_changed", "secret_changed"]);
  const sessAgo = (at: number): string => {
    const d = Date.now() - at;
    if (d < 60_000) return "just now";
    if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
    return `${Math.floor(d / 86_400_000)} days ago`;
  };
  async function loadMySecurity(): Promise<void> {
    try {
      const [s, e] = await Promise.all([api.mySessions(), api.mySecurity()]);
      mySessions = s.sessions;
      mySignins = e.events;
    } catch {
      /* offline — the panel just stays empty */
    }
  }
  $effect(() => {
    if (tab === "security") void loadMySecurity();
  });
  async function endSession(handle: string): Promise<void> {
    sessBusy = true;
    sessNote = null;
    try {
      await api.myRevokeSession({ handle });
      await loadMySecurity();
      sessNote = { kind: "ok", text: "That device has been signed out." };
    } catch {
      sessNote = { kind: "err", text: "Couldn't sign that device out." };
    } finally {
      sessBusy = false;
    }
  }
  async function endOtherSessions(): Promise<void> {
    if (!(await ask({ title: "Sign out every other device?", body: "You'll stay signed in here. Every other session ends immediately.", confirm: "sign the others out", danger: true }))) return;
    sessBusy = true;
    sessNote = null;
    try {
      const r = await api.myRevokeSession({ others: true });
      await loadMySecurity();
      sessNote = { kind: "ok", text: `Signed out ${r.revoked} other device(s).` };
    } catch {
      sessNote = { kind: "err", text: "Couldn't sign the other devices out." };
    } finally {
      sessBusy = false;
    }
  }

  // ---- Danger zone: self-service account deletion (iOS-store requirement) ----
  let confirmingDelete = $state(false);
  let delPassword = $state("");
  let deleting = $state(false);
  let delNote = $state("");

  async function deleteMyAccount() {
    if (deleting) return;
    deleting = true;
    delNote = "";
    try {
      await api.deleteAccount(delPassword);
      // The account is gone; the server killed every session. Leave cleanly.
      await logout();
    } catch (e) {
      delNote =
        e instanceof ApiError && e.code === "wrong_password"
          ? "That password isn't right."
          : "Couldn't delete the account.";
    } finally {
      deleting = false;
    }
  }

  async function changePassword() {
    if (changingPw) return;
    if (!pwCurrent || !pwNext) {
      pwNote = { kind: "err", text: "Fill in your current and new password." };
      return;
    }
    if (pwNext !== pwConfirm) {
      pwNote = { kind: "err", text: "New passwords don’t match." };
      return;
    }
    changingPw = true;
    pwNote = null;
    try {
      await api.changePassword(pwCurrent, pwNext);
      pwCurrent = pwNext = pwConfirm = "";
      pwNote = { kind: "ok", text: "Password changed. Other devices were signed out." };
    } catch (e) {
      pwNote = {
        kind: "err",
        text:
          e instanceof ApiError && e.code === "wrong_password"
            ? "Your current password is incorrect."
            : e instanceof ApiError && e.message
              ? e.message
              : "Couldn’t change the password.",
      };
    } finally {
      changingPw = false;
    }
  }

  // ---- Recovery secret (Security tab) ----
  let secCurrent = $state("");
  let secNext = $state("");
  let savingSec = $state(false);
  let secNote = $state<{ kind: "ok" | "err"; text: string } | null>(null);

  async function saveSecret() {
    if (savingSec) return;
    if (!secCurrent || !secNext) {
      secNote = { kind: "err", text: "Fill in your current password and the new secret." };
      return;
    }
    savingSec = true;
    secNote = null;
    try {
      const { user } = await api.setSecret(secCurrent, secNext);
      refreshSelf(user);
      secCurrent = secNext = "";
      secNote = { kind: "ok", text: "Recovery secret saved." };
    } catch (e) {
      secNote = {
        kind: "err",
        text:
          e instanceof ApiError && e.code === "wrong_password"
            ? "Your current password is incorrect."
            : e instanceof ApiError && e.message
              ? e.message
              : "Couldn’t save the recovery secret.",
      };
    } finally {
      savingSec = false;
    }
  }

  // Short enough to fit a phone's card without the ellipsis eating the end of
  // it — the point of a specimen is seeing the letterforms, and "…" is not one
  // of them. It still carries ascenders, descenders, a capital and a comma.
  const sampleText = "Pack my box with five dozen jugs.";
</script>

<div class="scrim" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="presentation">
  <div class="panel" role="dialog" aria-modal="true" aria-label="Settings">
    <aside class="tabs">
      <div class="tabs-head">Settings</div>
      <button class="tab" class:active={tab === "profile"} onclick={() => (tab = "profile")}>
        <span class="t-ico">👤</span> Profile
      </button>
      <button class="tab" class:active={tab === "appearance"} onclick={() => (tab = "appearance")}>
        <span class="t-ico">🎨</span> Appearance
      </button>
      <button class="tab" class:active={tab === "display"} onclick={() => (tab = "display")}>
        <span class="t-ico">🖥️</span> Display
      </button>
      <button class="tab" class:active={tab === "voice"} onclick={() => (tab = "voice")}>
        <span class="t-ico">🎙️</span> Voice & Audio
      </button>
      <button class="tab" class:active={tab === "security"} onclick={() => (tab = "security")}>
        <span class="t-ico">🔒</span> Security
      </button>
      <div class="tabs-spacer"></div>
      <button class="tab close-tab" aria-label="Close" onclick={onClose}>✕ Close</button>
    </aside>

    <section class="content">
      {#if tab === "profile" && me}
        <h2>Profile</h2>
        <p class="lead">How you appear to everyone in Solace.</p>

        <div class="ava-row">
          <Avatar name={me.displayName} id={me.id} avatar={me.avatar} size={72} />
          <div class="ava-actions">
            <button class="btn" disabled={uploading} onclick={() => fileInput?.click()}>
              {uploading ? "Uploading…" : "Upload photo"}
            </button>
            {#if me.avatar}
              <button class="btn ghost" disabled={uploading} onclick={removePhoto}>Remove</button>
            {/if}
            <div class="hint">PNG, JPEG, GIF, or WebP — up to 2 MB.</div>
          </div>
        </div>
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          bind:this={fileInput}
          onchange={onFilePicked}
          hidden
        />

        <label class="field">
          <span class="lbl">Display name</span>
          <input bind:value={draftName} maxlength="40" placeholder="Display name" />
        </label>

        <label class="field">
          <span class="lbl">About me</span>
          <textarea
            bind:value={draftBio}
            maxlength="500"
            rows="4"
            placeholder={bioLoaded ? "Tell people a little about yourself…" : "Loading…"}
            disabled={!bioLoaded}
          ></textarea>
          <span class="count">{draftBio.length}/500</span>
        </label>

        <div class="row-end">
          <button class="btn primary" disabled={savingProfile} onclick={saveProfile}>
            {savingProfile ? "Saving…" : "Save profile"}
          </button>
        </div>

        {#if profileNote}<p class="note {profileNote.kind}">{profileNote.text}</p>{/if}

        <span class="lbl">Notifications</span>
        <p class="hint">
          A system notification when someone @mentions or DMs you — even with Solace fully
          closed. Per-device: enable it on each machine you want pinged.
        </p>
        {#if !notify.supported}
          <p class="hint">This browser doesn't support notifications.</p>
        {:else if notify.blocked}
          <p class="hint">
            ⛔ <b>Notifications are blocked for Solace in this browser.</b> The toggle can't
            override that — allow notifications for this site in the browser's site settings
            (the lock icon by the address bar), then come back here.
          </p>
        {:else}
          <button class="ns-toggle" class:on={notify.enabled} onclick={() => void setNotifyEnabled(!notify.enabled)}>
            {notify.enabled ? "🔔 Notifications on" : "🔕 Notifications off — click to enable"}
          </button>
          <p class="hint">Turning it on fires a test notification — if you don't see one, the OS is muting them (Focus Assist / Do Not Disturb).</p>
        {/if}
        {#if alerts.list.length}
          <button class="ns-toggle" onclick={ackAll}>Clear {alerts.list.length} waiting alert{alerts.list.length === 1 ? "" : "s"}</button>
        {/if}

        <span class="lbl">Read receipts</span>
        <p class="hint">
          Show others when you've read their messages, and see when they've read yours. Turn it
          off and you get neither.
        </p>
        <button class="ns-toggle" class:on={prefs.readReceipts} onclick={() => void setReadReceipts(!prefs.readReceipts)}>
          {prefs.readReceipts ? "👁 Read receipts on" : "👁 Read receipts off — click to enable"}
        </button>

        {#if shellHasAlerts}
          <span class="lbl">Startup</span>
          <p class="hint">
            Launch Solace when this computer starts, so you're reachable without
            remembering to open it. Desktop app only.
          </p>
          <button class="ns-toggle" class:on={autostart} onclick={toggleAutostart}>
            {autostart ? "⏻ Launches at startup" : "⏻ Doesn't launch at startup — click to enable"}
          </button>
        {:else if isDesktopShell}
          <span class="lbl">Startup</span>
          <p class="hint">
            Launch-at-startup arrived in desktop app 0.3.2 — this install will
            offer it once it updates itself.
          </p>
        {/if}

        <CustomUploads />

        <div class="legacy">
          <span class="lbl">⚰️ Legacy — should the Wheel take you</span>
          <label class="field">
            <span class="lbl">Epitaph <span class="soft">(carved on your tombstone)</span></span>
            <input bind:value={epitaph} maxlength="90" placeholder="“They spun one too many times.”" />
            <span class="count">{epitaph.length}/90</span>
          </label>
          <label class="field">
            <span class="lbl">Last will <span class="soft">(who inherits your emoji + silver)</span></span>
            <select bind:value={willId}>
              <option value={null}>No will — bury it all with me</option>
              {#each heirs as h (h.id)}
                <option value={h.id}>{h.displayName} (@{h.username})</option>
              {/each}
            </select>
          </label>
          <div class="row-end">
            <button class="btn" disabled={savingLegacy} onclick={saveLegacy}>
              {savingLegacy ? "Notarizing…" : "Save legacy"}
            </button>
          </div>
          {#if legacyNote}<p class="note {legacyNote.kind}">{legacyNote.text}</p>{/if}
        </div>
      {:else if tab === "appearance"}
        <h2>Appearance</h2>
        <p class="lead">Yours alone — everyone picks their own look.</p>

        <span class="lbl">Theme</span>
        <p class="hint">
          Your unlocked themes. More are sold at
          <button class="linky" onclick={visitSterling}>Sterling's Emporium</button> — try them on there.
        </p>
        <div class="themes">
          {#each THEMES.filter((t) => !t.premium || ownsTheme(t.id)) as t (t.id)}
            <button
              class="theme-card"
              class:selected={prefs.theme === t.id}
              data-theme={t.id}
              onclick={() => setTheme(t.id as ThemeId)}
              title={t.name}
            >
              <span class="swatch">
                <span class="sw-panel">
                  <span class="sw-line long"></span>
                  <span class="sw-line short"></span>
                  <span class="sw-accent"></span>
                </span>
              </span>
              <span class="theme-name">{t.name}</span>
              <span class="theme-blurb">{t.blurb}</span>
            </button>
          {/each}
        </div>

        <span class="lbl">Chat font</span>
        <p class="hint">Applies to messages and the box you type in — the rest of the app stays put.</p>
        <div class="fonts">
          {#each FONTS as f (f.id)}
            <button
              class="font-card"
              class:selected={prefs.font === f.id}
              data-font={f.id}
              onclick={() => setFont(f.id as FontId)}
            >
              <span class="font-name">{f.name}</span>
              <span class="font-sample">{sampleText}</span>
              <span class="font-blurb">{f.blurb}</span>
            </button>
          {/each}
        </div>

      {:else if tab === "display"}
        <h2>Display</h2>
        <p class="lead">How Solace fills your screen — window mode, text size, stream quality.</p>

        {#if canFullscreen}
          <span class="lbl">Window mode</span>
          <p class="hint">
            {#if canBorderless}
              <b>Fullscreen windowed</b> covers the monitor with no title bar — alt-tab stays
              instant. Saved to this machine.
            {:else if isDesktopShell}
              <b>Fullscreen windowed needs desktop app 0.3.4</b> — this one is {shellVersion};
              it updates itself on the next launch. Saved to this machine.
            {:else}
              Fullscreen windowed is a desktop-app feature. Esc leaves fullscreen here.
              Saved to this machine.
            {/if}
          </p>
          <div class="scales">
            {#each DISPLAY_MODES as m (m.id)}
              {#if m.id !== "borderless" || canBorderless}
                <button
                  class="scale-btn"
                  class:selected={display.mode === m.id}
                  title={m.hint}
                  onclick={() => void setDisplayMode(m.id)}
                >{m.label}</button>
              {/if}
            {/each}
          </div>
          {#if display.note}<p class="hint">{display.note}</p>{/if}
        {/if}

        <span class="lbl">Font scale</span>
        <p class="hint">
          Text size across the app. Saved to your account.
          {#if isDesktopShell}The desktop app starts at 110%.{/if}
        </p>
        <div class="scales">
          {#each SCALES as s (s)}
            <button
              class="scale-btn"
              class:selected={(prefs.uiScale ?? DEFAULT_SCALE) === s}
              onclick={() => setScale(s)}
            >
              {s}%{#if s === DEFAULT_SCALE}<span class="scale-def">default</span>{/if}
            </button>
          {/each}
        </div>

        <span class="lbl">Streaming</span>
        <div class="sq-row">
          {#each Object.entries(STREAM_PRESETS) as [q, p] (q)}
            <button
              class="sq"
              class:on={voice.streamQuality === q}
              title={p.hint}
              onclick={() => setStreamQuality(q as StreamQuality)}
            >{p.label}</button>
          {/each}
        </div>
        <div class="sq-row">
          {#each [15, 30, 60] as f (f)}
            <button
              class="sq"
              class:on={voice.streamFps === f}
              onclick={() => setStreamFps(f as StreamFps)}
            >{f} fps</button>
          {/each}
        </div>
        <p class="hint">
          {STREAM_PRESETS[voice.streamQuality].label} @ {voice.streamFps}fps ·
          ~{streamMbps(voice.streamQuality, voice.streamFps)} Mbps ·
          {STREAM_PRESETS[voice.streamQuality].hint}. That's the server's upload cost PER viewer at
          full quality; a lower fallback layer kicks in automatically for anyone whose connection
          can't keep up. Applies the next time you start a share. Tip: the share picker lists every
          open window — minimized apps included — under "Window", and you can switch what you're
          sharing mid-stream from the browser's capture bar.
        </p>
      {:else if tab === "voice"}
        <h2>Voice &amp; Audio</h2>
        <p class="lead">Your devices, levels, and shortcuts — every pick here saves.</p>

        <span class="lbl">Devices</span>
        <label class="field">
          <span>Microphone</span>
          <select value={voice.micId ?? ""} onchange={(e) => setMic(e.currentTarget.value)}>
            {#if voice.mics.length === 0}<option value="">(grant mic permission to list devices)</option>{/if}
            {#each voice.mics as d (d.id)}
              <option value={d.id}>{d.label}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Output</span>
          <select value={voice.outputId ?? ""} onchange={(e) => setOutput(e.currentTarget.value)}>
            {#if voice.outputs.length === 0}<option value="">(system default)</option>{/if}
            {#each voice.outputs as d (d.id)}
              <option value={d.id}>{d.label}</option>
            {/each}
          </select>
        </label>
        {#if !canPickOutput}
          <p class="hint">
            This app always plays through {isMac ? "your Mac's" : "your computer's"} sound output. To use a headset,
            choose it {isMac ? "in Control Centre › Sound (or System Settings › Sound)" : "in your system's sound settings"} and Solace follows.
          </p>
        {/if}
        <div class="rediscover">
          <button class="btn" onclick={() => void rediscover()} disabled={finding}>
            {finding ? "Looking…" : "↻ Rediscover devices"}
          </button>
          {#if found}<span class="hint">{found}</span>{/if}
        </div>

        <span class="lbl">Levels</span>
        <p class="hint">Per-computer, like your devices — they apply live while you're in a call.</p>
        <div class="lvl-row">
          <span class="lvl-name">🎙️ Mic volume</span>
          <input
            type="range" min="50" max="300" step="5"
            value={Math.round(voice.micGain * 100)}
            oninput={(e) => void setMicGain(Number(e.currentTarget.value) / 100)}
            aria-label="Mic input volume"
          />
          <span class="lvl-val">{Math.round(voice.micGain * 100)}%</span>
        </div>
        <div class="lvl-row">
          <span class="lvl-name">🚪 Mic sensitivity</span>
          <input
            type="range" min="0" max="100" step="1"
            value={Math.round((voice.micGate / 0.25) * 100)}
            oninput={(e) => void setMicGate((Number(e.currentTarget.value) / 100) * 0.25)}
            aria-label="Mic sensitivity (noise gate)"
          />
          <span class="lvl-val">{voice.micGate <= 0 ? "open" : `${Math.round((voice.micGate / 0.25) * 100)}%`}</span>
        </div>
        <!-- Live ambient meter: fill = what your mic hears right now (same
             scale as the gate); the marker = where the gate cuts off. -->
        <div class="lvl-row">
          <span class="lvl-name">📈 Mic level</span>
          <div class="meter" aria-label="Live mic input level">
            <div
              class="meter-fill"
              class:passing={voice.micGate <= 0 || voice.micLevel > voice.micGate}
              style="width: {Math.min(100, (voice.micLevel / 0.25) * 100)}%"
            ></div>
            {#if voice.micGate > 0}
              <div class="meter-gate" style="left: {Math.min(100, (voice.micGate / 0.25) * 100)}%"></div>
            {/if}
          </div>
          <span class="lvl-val">{voice.micLevel > 0.002 ? Math.round((voice.micLevel / 0.25) * 100) : 0}%</span>
        </div>
        <p class="hint">Sensitivity is a noise gate — set the slider just above where the meter sits when you're silent. The bar turns bright when your sound would transmit.</p>
        <div class="lvl-row">
          <span class="lvl-name">🔊 Speaker volume</span>
          <input
            type="range" min="0" max="150" step="5"
            value={Math.round(voice.masterVolume * 100)}
            oninput={(e) => setMasterVolume(Number(e.currentTarget.value) / 100)}
            aria-label="Speaker output volume"
          />
          <span class="lvl-val">{Math.round(voice.masterVolume * 100)}%</span>
        </div>
        <p class="hint">Speaker volume scales everyone at once — the per-person sliders on the voice dock still fine-tune on top.</p>
        <div class="lvl-row">
          <span class="lvl-name">🎛️ Soundboard volume</span>
          <input
            type="range" min="0" max="150" step="5"
            value={Math.round(voice.soundboardVolume * 100)}
            oninput={(e) => setSoundboardVolume(Number(e.currentTarget.value) / 100)}
            aria-label="Soundboard volume"
          />
          <span class="lvl-val">{voice.soundboardVolume === 0 ? "muted" : `${Math.round(voice.soundboardVolume * 100)}%`}</span>
        </div>
        <p class="hint">How loud other people's soundboard pads and join/leave sounds are for you. 0 mutes them — your ears only.</p>
        <div class="lvl-row">
          <span class="lvl-name">🎰 App sounds</span>
          <input
            type="range" min="0" max="150" step="5"
            value={Math.round(sfxVol * 100)}
            oninput={(e) => {
              sfxVol = Number(e.currentTarget.value) / 100;
              setSfxVolume(sfxVol);
            }}
            onchange={() => {
              if (sfxVol > 0) playSfx("wheel-win-common", 0.7); // hear the level
            }}
            aria-label="App sound effects volume"
          />
          <span class="lvl-val">{sfxVol === 0 ? "muted" : `${Math.round(sfxVol * 100)}%`}</span>
        </div>
        <p class="hint">The games' volume — every wheel clack, chip, card, and boo-womp. Voices, streams, and the soundboard keep their own sliders above. Saved per device.</p>

        <span class="lbl">Processing</span>
        <button class="ns-toggle" class:on={voice.neuralNS} onclick={() => void toggleNeuralNS()}>
          {voice.neuralNS ? "🧠 Neural noise suppression" : "Noise suppression: standard"}
        </button>
        <p class="hint">Neural (RNNoise) scrubs keyboards, fans, and chatter before your voice leaves this device. Saved to your account — follows you everywhere. (Device picks above stay per-computer.)</p>

        <span class="lbl">Push-to-talk</span>
        <button class="ns-toggle" class:on={voice.pttEnabled} onclick={() => void togglePtt()}>
          {voice.pttEnabled ? "🎙️ Push-to-talk on" : "Push-to-talk off"}
        </button>
        <p class="hint">
          The mic stays muted unless your key is held — set "Push to talk (hold)" below.
          {#if isDesktopShell}The app also answers the global Ctrl+Shift+Space, even while gaming.{:else}Works while Solace is focused; the Windows app adds a global hotkey that works mid-game.{/if}
          Saved to your account.
        </p>

        <span class="lbl">Keyboard shortcuts</span>
        <p class="hint">Click Set, then press the combo you want. Esc cancels. Saved to your account.</p>
        <div class="binds" role="presentation" onkeydown={onCaptureKey}>
          {#each KEYBIND_ACTIONS as a (a.id)}
            <div class="bind-row">
              <span class="bind-name">{a.name}</span>
              <span class="bind-combo">{prefs.keybinds[a.id] ?? "—"}</span>
              <button class="mini" class:capturing={capturing === a.id} onclick={() => (capturing = capturing === a.id ? null : a.id)}>
                {capturing === a.id ? "Press keys…" : "Set"}
              </button>
              {#if prefs.keybinds[a.id]}
                <button class="mini ghost" onclick={() => setKeybind(a.id, null)}>✕</button>
              {/if}
            </div>
          {/each}
        </div>
        <p class="hint">Per-person volume sliders stay on the voice dock while you're in a call.</p>
      {:else if tab === "security"}
        <h2>Security</h2>
        <p class="lead">Change your password. Every other signed-in device gets logged out.</p>

        <label class="field">
          <span class="lbl">Current password</span>
          <input type="password" bind:value={pwCurrent} autocomplete="current-password" />
        </label>
        <label class="field">
          <span class="lbl">New password</span>
          <input type="password" bind:value={pwNext} autocomplete="new-password" />
        </label>
        <label class="field">
          <span class="lbl">Confirm new password</span>
          <input type="password" bind:value={pwConfirm} autocomplete="new-password" />
        </label>
        <p class="hint">
          At least 12 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.
        </p>
        <div class="row-end">
          <button class="btn primary" disabled={changingPw} onclick={changePassword}>
            {changingPw ? "Changing…" : "Change password"}
          </button>
        </div>
        {#if pwNote}<p class="note {pwNote.kind}">{pwNote.text}</p>{/if}

        <hr class="sep" />
        <!-- THE PAPERWORK: the documents, and the version this account accepted. -->
        <p class="lead">The paperwork.</p>
        <p class="hint legal-links">
          <a href="/legal/terms.html" target="_blank" rel="noopener">Terms of Service</a> ·
          <a href="/legal/guidelines.html" target="_blank" rel="noopener">Community Guidelines</a> ·
          <a href="/legal/privacy.html" target="_blank" rel="noopener">Privacy Policy</a> ·
          <a href="/legal/hosting.html" target="_blank" rel="noopener">Host Agreement</a> ·
          <a href="/legal/copyright.html" target="_blank" rel="noopener">Copyright</a>
          {#if me?.termsVersion != null}
            <br />You accepted version {me.termsVersion} of the Terms.
          {/if}
        </p>

        <hr class="sep" />
        <h2>Recovery secret</h2>
        <p class="lead">
          A memorable phrase that verifies sign-ins from a new place and resets a forgotten
          password. {me?.hasSecret ? "Update it below." : "You haven't set one yet."}
        </p>
        <label class="field">
          <span class="lbl">Current password</span>
          <input type="password" bind:value={secCurrent} autocomplete="current-password" />
        </label>
        <label class="field">
          <span class="lbl">{me?.hasSecret ? "New recovery secret" : "Recovery secret"}</span>
          <input type="password" bind:value={secNext} autocomplete="off" placeholder="A few memorable words" />
        </label>
        <p class="hint">Make it a real phrase, not one word — it can reset your password. Write it down; it can't be recovered.</p>
        <div class="row-end">
          <button class="btn primary" disabled={savingSec} onclick={saveSecret}>
            {savingSec ? "Saving…" : me?.hasSecret ? "Update secret" : "Set secret"}
          </button>
        </div>
        {#if secNote}<p class="note {secNote.kind}">{secNote.text}</p>{/if}

        <hr class="sep" />
        <h2>Where you're signed in</h2>
        <p class="lead">
          Every device holding a live sign-in. If you don't recognise one, sign it out —
          that's the fastest way to end someone else's access to your account.
        </p>
        {#each mySessions as s (s.handle)}
          <div class="sessrow" class:me={s.current}>
            <div class="sesswho">
              <b>{s.device}{#if s.current}<span class="thisone">this device</span>{/if}</b>
              <span class="sessmeta">
                {s.ip ?? "unknown address"} · signed in {sessAgo(s.createdAt)} · last used {sessAgo(s.lastSeenAt)}
              </span>
            </div>
            {#if !s.current}
              <button class="btn ghost small" disabled={sessBusy} onclick={() => void endSession(s.handle)}>Sign out</button>
            {/if}
          </div>
        {:else}
          <p class="hint">Loading…</p>
        {/each}
        {#if mySessions.length > 1}
          <div class="row-end">
            <button class="btn ghost" disabled={sessBusy} onclick={() => void endOtherSessions()}>
              Sign out everywhere else
            </button>
          </div>
        {/if}
        {#if sessNote}<p class="note {sessNote.kind}">{sessNote.text}</p>{/if}

        <h2>Recent sign-in attempts</h2>
        <p class="lead">
          The last few attempts on your account, successful or not. A run of failures you
          didn't make means someone is guessing — change your password.
        </p>
        <div class="evlist">
          {#each mySignins as e (e.id)}
            <div class="evrow">
              <span class="evwhen">{new Date(e.at).toLocaleString()}</span>
              <span class="evwhat {SELF_GOOD.has(e.outcome) ? 'good' : 'bad'}">{SELF_OUTCOMES[e.outcome] ?? e.outcome}</span>
              <span class="evip">{e.ip}</span>
            </div>
          {:else}
            <p class="hint">Nothing recorded yet.</p>
          {/each}
        </div>

        {#if !me?.isAdmin}
          <hr class="sep" />
          <h2 class="danger-h">Delete account</h2>
          <p class="lead">
            Permanent. Your identity is anonymized, your profile wiped, and your emoji and
            silver are burned. Messages you wrote stay (as "deleted user"). There is no undo.
          </p>
          {#if !confirmingDelete}
            <div class="row-end">
              <button class="btn danger-btn" onclick={() => (confirmingDelete = true)}>Delete my account…</button>
            </div>
          {:else}
            <label class="field">
              <span class="lbl">Confirm with your password</span>
              <input type="password" bind:value={delPassword} autocomplete="current-password" />
            </label>
            <div class="row-end">
              <button class="btn ghost" onclick={() => { confirmingDelete = false; delPassword = ""; }}>Keep my account</button>
              <button class="btn danger-btn" disabled={deleting || !delPassword} onclick={deleteMyAccount}>
                {deleting ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          {/if}
          {#if delNote}<p class="note err">{delNote}</p>{/if}
        {/if}
      {/if}
    </section>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    z-index: var(--z-modal, 10000); /* above the theme atmosphere (9990) */
    padding: 16px;
  }
  .panel {
    width: min(760px, 100%);
    height: min(600px, 92dvh);
    display: flex;
    background: var(--panel);
    border: 1px solid var(--line-2);
    border-radius: 14px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }
  .tabs {
    flex: none;
    width: 170px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 10px;
    background: var(--panel-2);
    border-right: 1px solid var(--line);
  }
  .tabs-head {
    font-weight: 800;
    font-size: 0.95rem;
    color: var(--ink);
    padding: 2px 10px 12px;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: none;
    border: none;
    border-radius: 8px;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .tab:hover {
    background: color-mix(in srgb, var(--panel) 60%, transparent);
    color: var(--ink);
  }
  .tab.active {
    background: var(--panel);
    color: var(--ink);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .t-ico {
    font-size: 0.95rem;
  }
  .tabs-spacer {
    flex: 1;
  }
  .close-tab {
    color: var(--ink-dim);
    font-weight: 500;
  }
  .content {
    flex: 1;
    min-width: 0;
    padding: 20px 24px 24px;
    overflow-y: auto;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 1.1rem;
    color: var(--ink);
  }
  .lead {
    margin: 0 0 18px;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .lbl {
    display: block;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-soft);
    margin-bottom: 6px;
  }
  .field {
    display: block;
    margin-bottom: 14px;
  }
  .field input,
  .field textarea {
    width: 100%;
    padding: 9px 10px;
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line-2);
    border-radius: 8px;
    font: inherit;
    box-sizing: border-box;
    resize: vertical;
  }
  .field input:focus,
  .field textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .field select {
    width: 100%;
    padding: 9px 10px;
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line-2);
    border-radius: 8px;
    font: inherit;
  }
  .legacy {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
  }
  .legacy > .lbl {
    margin-bottom: 12px;
  }
  .soft {
    text-transform: none;
    letter-spacing: 0;
    opacity: 0.7;
  }
  .count {
    display: block;
    margin-top: 4px;
    text-align: right;
    font-size: 0.72rem;
    color: var(--ink-dim);
  }
  .ava-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 18px;
  }
  .ava-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .ava-actions .hint {
    width: 100%;
  }
  .rediscover {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin: 4px 0 10px;
  }
  .rediscover .hint {
    margin: 0;
  }
  .btn {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--line-2);
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .btn.ghost {
    background: none;
    color: var(--ink-soft);
  }
  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  .btn.primary:hover:not(:disabled) {
    background: var(--accent-soft);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .row-end {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
  }
  .hint {
    margin: 0 0 10px;
    font-size: 0.78rem;
    color: var(--ink-dim);
  }
  .sep {
    margin: 22px 0 18px;
    border: none;
    border-top: 1px solid var(--line);
  }
  .danger-h {
    color: var(--danger);
  }
  .btn.danger-btn {
    border-color: var(--danger);
    color: var(--danger);
    background: none;
  }
  .btn.danger-btn:hover:not(:disabled) {
    background: var(--danger);
    color: #fff;
  }
  .note {
    margin: 12px 0 0;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 13px;
  }
  .note.ok {
    background: color-mix(in srgb, var(--ok) 14%, transparent);
    color: var(--ok);
  }
  .note.err {
    background: color-mix(in srgb, var(--danger) 14%, transparent);
    color: var(--danger);
  }

  /* ---- Your sessions + sign-in history ---- */
  .sessrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    margin-bottom: 8px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-2);
  }
  .sessrow.me {
    border-color: color-mix(in srgb, var(--ok) 50%, var(--line));
  }
  .sesswho {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .thisone {
    margin-left: 8px;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    background: color-mix(in srgb, var(--ok) 20%, transparent);
    color: var(--ok);
  }
  .sessmeta {
    font-size: 0.76rem;
    color: var(--ink-dim);
    font-family: ui-monospace, Consolas, monospace;
  }
  .btn.small {
    padding: 5px 12px;
    font-size: 0.78rem;
    flex: none;
  }
  .evlist {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  .evrow {
    display: grid;
    grid-template-columns: minmax(130px, auto) 1fr minmax(110px, auto);
    gap: 10px;
    padding: 7px 12px;
    font-size: 0.78rem;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 55%, transparent);
  }
  .evrow:last-child {
    border-bottom: none;
  }
  .evwhen {
    color: var(--ink-dim);
  }
  .evwhat.good {
    color: var(--ok);
  }
  .evwhat.bad {
    color: var(--danger);
  }
  .evip {
    font-family: ui-monospace, Consolas, monospace;
    color: var(--ink-soft);
    text-align: right;
  }

  /* ---- Theme cards. Each card carries data-theme, so the tokens inside it
     resolve to THAT theme's palette — the preview is the theme, not a copy. */
  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
    margin-bottom: 20px;
  }
  .theme-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    background: var(--bg);
    border: 2px solid var(--line);
    border-radius: 12px;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s ease, transform 0.15s ease;
  }
  .theme-card:hover {
    transform: translateY(-2px);
  }
  .theme-card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }
  .linky {
    display: inline;
    padding: 0;
    background: none;
    border: none;
    color: var(--accent);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  .swatch {
    display: block;
    padding: 10px;
    background: var(--bg);
    border-radius: 8px;
    border: 1px solid var(--line);
  }
  .sw-panel {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    position: relative;
  }
  .sw-line {
    height: 6px;
    border-radius: 3px;
    background: var(--ink-soft);
    opacity: 0.55;
  }
  .sw-line.long {
    width: 80%;
  }
  .sw-line.short {
    width: 55%;
  }
  .sw-accent {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent);
  }
  .theme-name {
    margin-top: 4px;
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--ink);
  }
  .theme-blurb {
    font-size: 0.74rem;
    line-height: 1.35;
    color: var(--ink-soft);
  }

  /* ---- Font cards: the sample renders in the actual stack via data-font. */
  .fonts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .scales {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .scale-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 16px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
  }
  .scale-btn:hover {
    border-color: var(--accent-soft);
  }
  .scale-btn.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .scale-def {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .lvl-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .lvl-name {
    flex: none;
    width: 140px;
    font-size: 0.85rem;
    color: var(--ink);
  }
  .lvl-row input[type="range"] {
    flex: 1;
    accent-color: var(--accent);
  }
  .lvl-val {
    flex: none;
    width: 48px;
    text-align: right;
    font-size: 0.78rem;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }
  /* Stream quality tier picker. */
  .sq-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .sq {
    padding: 8px 16px;
    border-radius: 9px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .sq:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .sq.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, var(--panel-2));
  }

  /* Live mic meter: fill tracks input level; the notch marks the gate. */
  .meter {
    position: relative;
    flex: 1;
    height: 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ink) 10%, transparent);
    border: 1px solid var(--line);
    overflow: hidden;
  }
  .meter-fill {
    height: 100%;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ink-dim) 55%, transparent);
    transition: width 90ms linear;
  }
  .meter-fill.passing {
    background: linear-gradient(90deg, color-mix(in srgb, var(--ok) 70%, transparent), var(--ok));
  }
  .meter-gate {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    background: var(--accent);
    box-shadow: 0 0 5px color-mix(in srgb, var(--accent) 70%, transparent);
  }
  .ns-toggle {
    align-self: flex-start;
    padding: 9px 18px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
  }
  .ns-toggle.on {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--panel-2));
  }
  .binds {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bind-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 9px;
  }
  .bind-name {
    flex: 1;
    font-size: 0.86rem;
    color: var(--ink);
  }
  .bind-combo {
    font-family: monospace;
    font-size: 0.8rem;
    color: var(--accent);
    min-width: 110px;
    text-align: right;
  }
  .bind-row .mini.capturing {
    border-color: var(--accent);
    color: var(--accent);
    animation: pulse-cap 1s ease-in-out infinite;
  }
  @keyframes pulse-cap {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }
  .font-card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 10px 12px;
    background: var(--panel-2);
    border: 2px solid var(--line);
    border-radius: 10px;
    font: inherit;
    text-align: left;
    cursor: pointer;
    color: var(--ink);
  }
  .font-card:hover {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--line));
  }
  .font-card.selected {
    border-color: var(--accent);
  }
  .font-name {
    font-weight: 700;
    font-size: 0.85rem;
  }
  .font-sample {
    font-family: var(--chat-font);
    font-size: 0.9rem;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .font-blurb {
    font-size: 0.72rem;
    color: var(--ink-dim);
  }

  /* PHONE MODE (Sep 2026): Settings is a full screen, not a windowed modal,
     and the tabs are a wrapping row of chips with the ✕ pinned top-right —
     the old sideways-scrolling tab strip hid two tabs off the edge. */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .scrim {
      padding: 0;
      place-items: stretch;
    }
    .panel {
      flex-direction: column;
      width: 100%;
      height: 100dvh;
      border: none;
      border-radius: 0;
    }
    .tabs {
      position: relative;
      width: 100%;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: calc(10px + env(safe-area-inset-top)) 52px 10px 12px;
      border-right: none;
      border-bottom: 1px solid var(--line);
    }
    /* Compact chips: three fit on the first row of a 390px phone (they used
       to wrap to three rows and take a fifth of the screen). */
    .tab {
      flex: none;
      white-space: nowrap;
      gap: 5px;
      padding: 6px 10px;
      font-size: 0.8rem;
      border: 1px solid var(--line);
      border-radius: 999px;
    }
    .tab .t-ico {
      width: auto;
    }
    .tab.active {
      border-color: var(--accent);
    }
    .close-tab {
      position: absolute;
      top: calc(8px + env(safe-area-inset-top));
      right: 10px;
      width: 38px;
      height: 38px;
      padding: 0;
      gap: 0; /* the zero-width text node still took the flex gap and nudged the ✕ off-centre */
      justify-content: center;
      font-size: 0; /* "✕ Close" → just the ✕ (the word clipped at 38px) */
    }
    .close-tab::before {
      content: "✕";
      font-size: 1rem;
    }
    .tabs-head {
      display: none;
    }
    .tabs-spacer {
      display: none;
    }
    .content {
      padding: 16px 16px calc(24px + env(safe-area-inset-bottom));
    }
    .fonts {
      grid-template-columns: 1fr;
    }
  }
</style>
