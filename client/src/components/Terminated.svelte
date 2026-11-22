<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { session, logout } from "../lib/session.svelte";
  import { wheel } from "../lib/wheel.svelte";

  const LINGER_MS = 6000; // let the player read the epitaph before the forced logout

  // Capture these now — session.user is cleared when we log out below.
  const createdAt = session.user?.createdAt ?? null;
  const diedAt = wheel.diedAt || Date.now();

  /** "3 days, 4 hours" / "42 seconds" / "mere moments" — the two largest units. */
  function lifespan(from: number, to: number): string {
    const sec = Math.max(0, Math.floor((to - from) / 1000));
    const units: [string, number][] = [
      ["day", Math.floor(sec / 86400)],
      ["hour", Math.floor((sec % 86400) / 3600)],
      ["minute", Math.floor((sec % 3600) / 60)],
      ["second", sec % 60],
    ];
    const parts = units
      .filter(([, v]) => v > 0)
      .map(([label, v]) => `${v} ${label}${v === 1 ? "" : "s"}`);
    return parts.length ? parts.slice(0, 2).join(", ") : "mere moments";
  }

  const lived = createdAt != null ? lifespan(createdAt, diedAt) : null;
  const fmtDate = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  let timer: ReturnType<typeof setTimeout>;
  onMount(() => {
    timer = setTimeout(async () => {
      await logout(); // clears the session → the app returns to the login gate
      wheel.dead = false; // clear stale state so the next login starts clean
      wheel.diedAt = 0;
    }, LINGER_MS);
  });
  onDestroy(() => clearTimeout(timer));
</script>

<div class="terminated" role="alertdialog" aria-label="Account terminated">
  <div class="content">
    <h1 class="word">TERMINATED</h1>
    {#if lived}
      <p class="lived">This account lived for <b>{lived}</b>.</p>
      <p class="dates">{fmtDate(createdAt ?? diedAt)} — {fmtDate(diedAt)}</p>
    {/if}
    <!-- The cinematic is unchanged on purpose — this still has to land as a
         death. What changed (Aug 2026) is that it is no longer the last word:
         the grave stays open for 48 hours, and signing back in lands on the
         wake rather than a locked door. -->
    <p class="signoff">The wheel has claimed you. Returning to the gate…</p>
    <p class="wake-note">
      The ground stays open for <b>48 hours</b>. Anyone here can pull you out of it — and
      you can buy yourself back. Sign in again to see how long you have.
    </p>
  </div>
</div>

<style>
  .terminated {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 10000); /* above the theme atmosphere (9990) — the death cinematic owns the screen */
    display: grid;
    place-items: center;
    color: #f2e9e4;
    background: #000;
    animation: term-bg 2.2s ease forwards;
  }
  @keyframes term-bg {
    0% {
      background: #c20d1f;
    }
    8% {
      background: #8a0713;
    }
    100% {
      background: #000;
    }
  }
  .content {
    text-align: center;
    padding: 24px;
    opacity: 0;
    animation: term-in 2.6s ease forwards;
  }
  @keyframes term-in {
    0%,
    22% {
      opacity: 0;
      transform: translateY(10px) scale(0.98);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  .word {
    margin: 0;
    font-size: clamp(34px, 9vw, 92px);
    font-weight: 800;
    letter-spacing: 0.18em;
    color: #e0453a;
    text-shadow:
      0 0 18px rgba(224, 69, 58, 0.55),
      0 2px 2px rgba(0, 0, 0, 0.6);
  }
  .lived {
    margin: 22px 0 4px;
    font-size: clamp(15px, 2.6vw, 20px);
    color: #d9cfc7;
  }
  .lived b {
    color: #f2e9e4;
  }
  .dates {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.08em;
    color: #8c827c;
  }
  .signoff {
    margin-top: 34px;
    font-size: 12.5px;
    color: #6f655f;
    opacity: 0;
    animation: term-fade 1s ease 2.6s forwards;
  }
  /* Comes in last, well after the word has landed — the death should register
     before the way out of it does. */
  .wake-note {
    margin: 14px auto 0;
    max-width: 30rem;
    font-size: 12px;
    line-height: 1.6;
    color: #8a6f62;
    opacity: 0;
    animation: term-fade 1.2s ease 4.2s forwards;
  }
  .wake-note b {
    color: #c49a84;
  }
  @keyframes term-fade {
    to {
      opacity: 0.9;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .terminated,
    .content,
    .signoff {
      animation-duration: 0.01ms;
    }
  }
</style>
