<script lang="ts">
  // THE WALLET (Oct 2026): send silver to another player. The server moves it
  // wallet to wallet in one go — nothing is made, nothing is lost.
  import { onMount } from "svelte";
  import { chat } from "../lib/chat.svelte";
  import { session } from "../lib/session.svelte";
  import { wallet, silverSend, loadTransfers, sendSilver } from "../lib/wallet.svelte";
  import { isBlocked } from "../lib/blocks.svelte";
  import { ask } from "../lib/confirm.svelte";
  import { messageStamp } from "../lib/time";
  import Avatar from "./Avatar.svelte";
  import Coin from "./Coin.svelte";

  onMount(() => {
    void loadTransfers();
  });

  let query = $state("");
  let amountText = $state("");
  let note = $state("");
  let busy = $state(false);
  let msg = $state<{ text: string; bad?: boolean } | null>(null);

  const people = $derived(
    chat.members
      .filter((m) => m.id !== session.user?.id && !m.isBot && !m.disabled && !m.locked && !isBlocked(m.id))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  );
  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people.slice(0, 8);
    return people.filter((m) => m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)).slice(0, 8);
  });
  const to = $derived(people.find((m) => m.id === silverSend.to) ?? null);
  const amount = $derived(Math.floor(Number(amountText.replace(/[^0-9]/g, "")) || 0));
  const canSend = $derived(
    !!to && amount >= 1 && amount <= wallet.coins && amount <= silverSend.maxSend && !busy && !silverSend.owesGoblins,
  );

  const QUICK = [100, 500, 1_000, 5_000];

  const ERR: Record<string, string> = {
    insufficient: "You don't have that much silver.",
    owes_goblins: "Pay off the goblins first.",
    blocked: "You can't send silver to this person.",
    user_unavailable: "They can't receive silver right now.",
    user_not_found: "They can't receive silver right now.",
    rate_limited: "Slow down a little.",
    note_too_long: "That note is too long.",
    bad_amount: "Pick an amount.",
  };

  async function send(): Promise<void> {
    if (!canSend || !to) return;
    const sure = await ask({
      title: `Send ${amount.toLocaleString()} silver?`,
      body: `It goes to ${to.displayName} straight away. You can't take it back.`,
      confirm: "Send",
    });
    if (!sure) return;
    busy = true;
    const r = await sendSilver(to.id, amount, note);
    busy = false;
    if (!r.ok) {
      msg = { text: ERR[r.error ?? ""] ?? "That didn't go through.", bad: true };
      return;
    }
    msg = { text: `Sent ${amount.toLocaleString()} silver to ${to.displayName}.` };
    amountText = "";
    note = "";
  }

  function pick(id: number): void {
    silverSend.to = id;
    query = "";
    msg = null;
  }
</script>

<div class="wallet">
  <section class="card send">
    <h2>Send silver</h2>
    <p class="bal"><Coin size={16} /> You have <b>{wallet.coins.toLocaleString()}</b></p>

    {#if silverSend.owesGoblins}
      <p class="warn">You owe the goblins. Pay them off before you send silver to anyone.</p>
    {/if}

    {#if to}
      <div class="to">
        <Avatar name={to.displayName} id={to.id} avatar={to.avatar} size={32} profile />
        <span class="name">{to.displayName}</span>
        <button class="link" onclick={() => (silverSend.to = null)}>change</button>
      </div>
    {:else}
      <label class="field">
        <span>To</span>
        <input type="text" placeholder="Search players" bind:value={query} maxlength="40" />
      </label>
      <div class="people">
        {#each matches as m (m.id)}
          <button class="person" onclick={() => pick(m.id)}>
            <Avatar name={m.displayName} id={m.id} avatar={m.avatar} size={26} />
            <span>{m.displayName}</span>
            <span class="handle">@{m.username}</span>
          </button>
        {:else}
          <p class="empty">Nobody by that name.</p>
        {/each}
      </div>
    {/if}

    <label class="field">
      <span>Amount</span>
      <input type="text" inputmode="numeric" placeholder="0" bind:value={amountText} maxlength="9" />
    </label>
    <div class="quick">
      {#each QUICK as q (q)}
        <button class="chip" disabled={q > wallet.coins} onclick={() => (amountText = String(q))}>{q.toLocaleString()}</button>
      {/each}
    </div>
    <label class="field">
      <span>Note <i>(optional)</i></span>
      <input type="text" placeholder="What's it for?" bind:value={note} maxlength="140" />
    </label>

    {#if msg}<p class="msg" class:bad={msg.bad}>{msg.text}</p>{/if}

    <button class="go" disabled={!canSend} onclick={send}>
      {busy ? "Sending…" : amount > 0 && to ? `Send ${amount.toLocaleString()} to ${to.displayName}` : "Send"}
    </button>
  </section>

  <section class="card history">
    <h2>Recent</h2>
    {#if !silverSend.loaded}
      <p class="empty">Loading…</p>
    {:else if !silverSend.history.length}
      <p class="empty">No silver sent or received yet.</p>
    {:else}
      <ul>
        {#each silverSend.history as t (t.id)}
          <li class:in={t.dir === "received"}>
            <Avatar name={t.other?.displayName ?? "?"} id={t.other?.id ?? 0} avatar={t.other?.avatar ?? null} size={28} profile={!!t.other} />
            <div class="what">
              <span class="who">
                {t.dir === "sent" ? "To" : "From"} <b>{t.other?.displayName ?? "someone"}</b>
              </span>
              {#if t.note}<span class="note">“{t.note}”</span>{/if}
              <span class="when" title={messageStamp(t.at).full}>{messageStamp(t.at).text}</span>
            </div>
            <span class="amt">{t.dir === "sent" ? "−" : "+"}{t.amount.toLocaleString()}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .wallet {
    height: 100%;
    overflow-y: auto;
    display: grid;
    grid-template-columns: minmax(0, 420px) minmax(0, 480px);
    justify-content: center;
    align-items: start;
    gap: 16px;
    padding: 18px 20px 28px;
  }
  .card {
    background: rgba(12, 20, 15, 0.82);
    border: 1px solid rgba(230, 190, 120, 0.25);
    border-radius: 14px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: #f2e6cc;
  }
  h2 {
    margin: 0;
    font: 700 1.05rem Georgia, "Times New Roman", serif;
    color: #f3dfa8;
    letter-spacing: 0.02em;
  }
  .bal {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgba(255, 240, 220, 0.75);
  }
  .bal b { color: #f3dfa8; }
  .warn {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(180, 60, 40, 0.18);
    border: 1px solid rgba(220, 90, 60, 0.4);
    color: #f4b9a6;
    font-size: 0.9rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.8rem;
    color: rgba(255, 240, 220, 0.65);
  }
  .field i { font-style: normal; opacity: 0.7; }
  .field input {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(230, 190, 120, 0.25);
    border-radius: 8px;
    color: #f2e6cc;
    padding: 9px 11px;
    font: inherit;
    font-size: 0.95rem;
  }
  .field input:focus { outline: none; border-color: rgba(243, 223, 168, 0.65); }
  .people {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 240px;
    overflow-y: auto;
  }
  .person {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 8px;
    background: none;
    border: none;
    border-radius: 8px;
    color: #f2e6cc;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .person:hover { background: rgba(243, 223, 168, 0.08); }
  .handle { color: rgba(255, 240, 220, 0.45); font-size: 0.8rem; }
  .to {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 10px;
    background: rgba(243, 223, 168, 0.08);
  }
  .to .name { font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .link {
    background: none;
    border: none;
    color: #e2b867;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    text-decoration: underline;
  }
  .quick { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(230, 190, 120, 0.3);
    border-radius: 999px;
    color: #f3dfa8;
    padding: 5px 12px;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .chip:disabled { opacity: 0.4; cursor: default; }
  .go {
    margin-top: 4px;
    padding: 11px 14px;
    border-radius: 10px;
    border: none;
    background: linear-gradient(#e7c27a, #c7953f);
    color: #241a0c;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .go:disabled { opacity: 0.45; cursor: default; }
  .msg { margin: 0; color: #a9dfa0; font-size: 0.9rem; }
  .msg.bad { color: #f4b9a6; }
  .empty { margin: 0; color: rgba(255, 240, 220, 0.5); font-size: 0.9rem; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 4px;
    border-bottom: 1px solid rgba(230, 190, 120, 0.1);
  }
  .what { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .who { font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { font-size: 0.82rem; color: rgba(255, 240, 220, 0.7); overflow-wrap: anywhere; }
  .when { font-size: 0.75rem; color: rgba(255, 240, 220, 0.45); }
  .amt { font-weight: 800; font-variant-numeric: tabular-nums; color: #f4b9a6; }
  li.in .amt { color: #a9dfa0; }

  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .wallet {
      grid-template-columns: minmax(0, 1fr);
      padding: 12px 12px 24px;
    }
    .person, .chip { min-height: 44px; }
  }
</style>
