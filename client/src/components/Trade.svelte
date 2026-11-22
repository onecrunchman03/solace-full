<script lang="ts">
  import { api, type Emoji, type Trade } from "../lib/api";
  import {
    trade,
    tradeUI,
    createTrade,
    acceptTrade,
    declineTrade,
    cancelTrade,
  } from "../lib/trade.svelte";
  import { chat } from "../lib/chat.svelte";
  import { session } from "../lib/session.svelte";
  import { emoji } from "../lib/emoji.svelte";
  import { groupByTier, TIER_COLOR } from "../lib/tiers";
  import { openProfile } from "../lib/nav.svelte";
  import Avatar from "./Avatar.svelte";

  const candidates = $derived(chat.members.filter((m) => !m.disabled && m.id !== session.user?.id));
  const myInv = $derived(emoji.owned);
  // Both sides of the swap read as a rarity ladder, not a heap.
  const myGroups = $derived(groupByTier(myInv));

  let actionErr = $state("");

  const CREATE_ERR: Record<string, string> = {
    not_owned: "You no longer own one of those emoji.",
    they_lack: "They no longer own an emoji you requested.",
    they_have_offer: "They already own something you're offering.",
    you_have_request: "You already own something you're requesting.",
    overlap: "You can't offer and request the same emoji.",
    bad_items: "Pick 1–12 emoji to offer (and up to 12 to request).",
    self_trade: "You can't trade with yourself.",
    user_unavailable: "That collector isn't available.",
    in_arrears: "The goblins have frozen your assets — nothing leaves your hands while you owe them.",
  };
  const ACCEPT_ERR: Record<string, string> = {
    trade_invalid: "That offer is no longer valid — someone's inventory changed.",
    not_pending: "That offer was already handled.",
    in_arrears: "The goblins have frozen your assets — you can't give anything up while you owe them.",
  };

  // ---- compose flow ----
  let composing = $state(false);
  let step = $state<"user" | "items">("user");
  let recipientId = $state<number | null>(null);
  let theirInv = $state<Emoji[]>([]);
  const theirGroups = $derived(groupByTier(theirInv));
  let loadingInv = $state(false);
  let offerSel = $state<Set<string>>(new Set());
  let requestSel = $state<Set<string>>(new Set());
  let note = $state("");
  let sending = $state(false);

  const recipient = $derived(chat.members.find((m) => m.id === recipientId) ?? null);

  // Launch compose for a specific user (from a profile's Trade button).
  $effect(() => {
    const target = tradeUI.composeWith;
    if (target == null) return;
    tradeUI.composeWith = null;
    void openComposeFor(target);
  });

  function newOffer() {
    resetCompose();
    composing = true;
    step = "user";
  }
  function resetCompose() {
    recipientId = null;
    theirInv = [];
    offerSel = new Set();
    requestSel = new Set();
    note = "";
    actionErr = "";
  }
  async function openComposeFor(userId: number) {
    resetCompose();
    composing = true;
    recipientId = userId;
    step = "items";
    await loadTheirInventory(userId);
  }
  async function pickRecipient(userId: number) {
    recipientId = userId;
    step = "items";
    await loadTheirInventory(userId);
  }
  async function loadTheirInventory(userId: number) {
    loadingInv = true;
    theirInv = [];
    try {
      theirInv = (await api.profile(userId)).inventory;
    } catch {
      theirInv = [];
    } finally {
      loadingInv = false;
    }
  }
  function toggle(set: Set<string>, code: string): Set<string> {
    const next = new Set(set);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    return next;
  }

  async function send() {
    if (recipientId == null || offerSel.size === 0 || sending) return;
    sending = true;
    actionErr = "";
    const r = await createTrade(recipientId, [...offerSel], [...requestSel], note.trim() || undefined);
    sending = false;
    if (r.ok) {
      composing = false;
      resetCompose();
    } else {
      actionErr = CREATE_ERR[r.error ?? ""] ?? "Couldn't send that offer.";
    }
  }

  async function onAccept(t: Trade) {
    actionErr = "";
    const r = await acceptTrade(t.id);
    if (!r.ok) actionErr = ACCEPT_ERR[r.error ?? ""] ?? "Couldn't accept that offer.";
  }
</script>

<div class="trade">
  <div class="head">
    <h1>Direct Trade</h1>
    {#if !composing}
      <button class="new" onclick={newOffer}>＋ New offer</button>
    {/if}
  </div>

  {#if actionErr && !composing}<div class="banner err">{actionErr}</div>{/if}

  {#if composing}
    <!-- ===== compose ===== -->
    <div class="compose">
      <div class="compose-top">
        <strong>New trade offer</strong>
        <button class="x" onclick={() => (composing = false)}>✕</button>
      </div>

      {#if step === "user"}
        <div class="pick-user">
          <div class="sub">Who do you want to trade with?</div>
          <div class="ulist">
            {#each candidates as m (m.id)}
              <button class="urow" onclick={() => pickRecipient(m.id)}>
                <Avatar name={m.displayName} id={m.id} avatar={m.avatar} size={28} />
                <span>{m.displayName}</span>
              </button>
            {/each}
            {#if candidates.length === 0}<div class="muted">No one else to trade with yet.</div>{/if}
          </div>
        </div>
      {:else}
        <div class="items">
          <div class="who-row">
            <span class="sub">Trading with</span>
            <Avatar name={recipient?.displayName ?? "?"} id={recipientId ?? 0} avatar={recipient?.avatar ?? null} size={24} profile />
            <b>{recipient?.displayName ?? ""}</b>
            <button class="link" onclick={() => (step = "user")}>change</button>
          </div>

          <div class="col">
            <div class="col-head">You give <span class="cnt">{offerSel.size}</span></div>
            {#if myInv.length === 0}
              <div class="muted">You don't own any emoji yet.</div>
            {:else}
              {#each myGroups as g (g.tier)}
                <div class="tier-row" style="--tier:{TIER_COLOR[g.tier] ?? 'var(--line)'}">
                  <div class="tier-head">{g.tier}<span class="tn">{g.items.length}</span></div>
                  <div class="grid">
                    {#each g.items as e (e.code)}
                      <button
                        class="tile"
                        class:sel={offerSel.has(e.code)}
                        title={`${e.name} · ${e.tier}`}
                        onclick={() => (offerSel = toggle(offerSel, e.code))}
                      >
                        <img src={`/emoji/${e.file}`} alt={e.name} />
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          <div class="swap">⇅</div>

          <div class="col">
            <div class="col-head">You get <span class="cnt">{requestSel.size}</span></div>
            {#if loadingInv}
              <div class="muted">Loading their collection…</div>
            {:else if theirInv.length === 0}
              <div class="muted">They don't own any emoji yet.</div>
            {:else}
              {#each theirGroups as g (g.tier)}
                <div class="tier-row" style="--tier:{TIER_COLOR[g.tier] ?? 'var(--line)'}">
                  <div class="tier-head">{g.tier}<span class="tn">{g.items.length}</span></div>
                  <div class="grid">
                    {#each g.items as e (e.code)}
                      <button
                        class="tile"
                        class:sel={requestSel.has(e.code)}
                        title={`${e.name} · ${e.tier}`}
                        onclick={() => (requestSel = toggle(requestSel, e.code))}
                      >
                        <img src={`/emoji/${e.file}`} alt={e.name} />
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          <input class="note" bind:value={note} maxlength="200" placeholder="Add a note (optional)" />

          {#if actionErr}<div class="banner err">{actionErr}</div>{/if}

          <div class="send-row">
            <span class="hint">
              {#if offerSel.size === 0}Pick at least one emoji to give.{:else if requestSel.size === 0}A gift! You're asking for nothing back.{:else}{offerSel.size} for {requestSel.size}.{/if}
            </span>
            <button class="send" disabled={offerSel.size === 0 || sending} onclick={send}>
              {sending ? "Sending…" : "Send offer"}
            </button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <!-- ===== offer lists ===== -->
    <div class="lists">
      <section>
        <h2>Offers to you {#if trade.incoming.length}<span class="pill">{trade.incoming.length}</span>{/if}</h2>
        {#if trade.incoming.length === 0}
          <p class="muted">No incoming offers.</p>
        {:else}
          {#each trade.incoming as t (t.id)}
            <div class="card">
              <button class="peer" onclick={() => openProfile(t.fromUser.id)}>
                <Avatar name={t.fromUser.displayName} id={t.fromUser.id} avatar={t.fromUser.avatar} size={30} profile />
                <b>{t.fromUser.displayName}</b> offers
              </button>
              <div class="barter">
                <div class="side">
                  <span class="lbl">they give</span>
                  <div class="emos">
                    {#each t.offered as e (e.code)}<img src={`/emoji/${e.file}`} alt={e.name} title={e.name} />{/each}
                  </div>
                </div>
                <span class="arrow">→</span>
                <div class="side">
                  <span class="lbl">you give</span>
                  <div class="emos">
                    {#if t.requested.length}{#each t.requested as e (e.code)}<img src={`/emoji/${e.file}`} alt={e.name} title={e.name} />{/each}{:else}<span class="gift">nothing (a gift!)</span>{/if}
                  </div>
                </div>
              </div>
              {#if t.note}<div class="note-line">“{t.note}”</div>{/if}
              <div class="acts">
                <button class="accept" onclick={() => onAccept(t)}>Accept</button>
                <button class="ghost" onclick={() => declineTrade(t.id)}>Decline</button>
              </div>
            </div>
          {/each}
        {/if}
      </section>

      <section>
        <h2>Your offers {#if trade.outgoing.length}<span class="pill">{trade.outgoing.length}</span>{/if}</h2>
        {#if trade.outgoing.length === 0}
          <p class="muted">You haven't sent any offers. Hit <b>＋ New offer</b>.</p>
        {:else}
          {#each trade.outgoing as t (t.id)}
            <div class="card">
              <button class="peer" onclick={() => openProfile(t.toUser.id)}>
                To <Avatar name={t.toUser.displayName} id={t.toUser.id} avatar={t.toUser.avatar} size={30} profile />
                <b>{t.toUser.displayName}</b>
              </button>
              <div class="barter">
                <div class="side">
                  <span class="lbl">you give</span>
                  <div class="emos">
                    {#each t.offered as e (e.code)}<img src={`/emoji/${e.file}`} alt={e.name} title={e.name} />{/each}
                  </div>
                </div>
                <span class="arrow">→</span>
                <div class="side">
                  <span class="lbl">you get</span>
                  <div class="emos">
                    {#if t.requested.length}{#each t.requested as e (e.code)}<img src={`/emoji/${e.file}`} alt={e.name} title={e.name} />{/each}{:else}<span class="gift">nothing (a gift)</span>{/if}
                  </div>
                </div>
              </div>
              {#if t.note}<div class="note-line">“{t.note}”</div>{/if}
              <div class="acts">
                <span class="pending">Awaiting {t.toUser.displayName}…</span>
                <button class="ghost" onclick={() => cancelTrade(t.id)}>Cancel</button>
              </div>
            </div>
          {/each}
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  /* GROUPED BY RARITY (Josh, Sep 2026: "cleanly organize the emojis by
     tier"). Same treatment as the Shop's sell grid and the Forge: a heading
     and a slight wash in the tier's own colour, rarest group first, so the
     scarce things you are actually deciding about are at the top of the box
     instead of buried under four hundred commons. */
  .tier-row {
    margin-bottom: 10px;
    padding: 8px 10px 10px;
    border-radius: 10px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--tier) 10%, transparent), transparent 85%);
    border: 1px solid color-mix(in srgb, var(--tier) 24%, var(--line));
  }
  .tier-row:last-child {
    margin-bottom: 0;
  }
  .tier-head {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 6px;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--tier) 72%, var(--ink));
  }
  .tier-head .tn {
    color: var(--ink-dim);
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .trade {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    padding: clamp(18px, 4vh, 40px) 22px 48px;
  }
  .head {
    max-width: 760px;
    margin: 0 auto 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .head h1 {
    margin: 0;
    font-size: 1.6rem;
    color: var(--ink);
  }
  .new {
    padding: 8px 16px;
    border-radius: 9px;
    border: none;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .new:hover {
    filter: brightness(1.06);
  }
  .banner {
    max-width: 760px;
    margin: 0 auto 14px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.85rem;
  }
  .banner.err {
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    border: 1px solid var(--danger);
    color: var(--ink);
  }
  .lists,
  .compose {
    max-width: 760px;
    margin: 0 auto;
  }
  section {
    margin-bottom: 26px;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-soft);
    margin: 0 0 10px;
  }
  .pill {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 0.72rem;
    font-weight: 700;
  }
  .muted {
    color: var(--ink-dim);
    font-size: 0.9rem;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 14px 16px;
    margin-bottom: 12px;
  }
  .peer {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.92rem;
    cursor: pointer;
    padding: 0;
    margin-bottom: 10px;
  }
  .peer b {
    color: var(--ink);
  }
  .peer:hover b {
    text-decoration: underline;
  }
  .barter {
    display: flex;
    align-items: stretch;
    gap: 12px;
  }
  .side {
    flex: 1;
    min-width: 0;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 10px;
  }
  .lbl {
    display: block;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-dim);
    margin-bottom: 6px;
  }
  .emos {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    min-height: 34px;
  }
  .emos img {
    width: 34px;
    height: 34px;
    object-fit: contain;
  }
  .gift {
    color: var(--ink-dim);
    font-size: 0.82rem;
    font-style: italic;
  }
  .arrow {
    align-self: center;
    color: var(--ink-dim);
    font-size: 1.1rem;
    flex: none;
  }
  .note-line {
    margin-top: 10px;
    color: var(--ink-soft);
    font-size: 0.86rem;
    font-style: italic;
  }
  .acts {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
  }
  .accept,
  .send {
    padding: 7px 16px;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .accept:hover,
  .send:hover {
    filter: brightness(1.06);
  }
  .ghost {
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-soft);
    font: inherit;
    cursor: pointer;
  }
  .ghost:hover {
    color: var(--ink);
    border-color: var(--ink-dim);
  }
  .pending {
    flex: 1;
    color: var(--ink-dim);
    font-size: 0.84rem;
  }
  .send:disabled {
    opacity: 0.55;
    cursor: default;
    filter: none;
  }

  /* compose */
  .compose {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 16px 18px 18px;
  }
  .compose-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .x {
    background: none;
    border: none;
    color: var(--ink-soft);
    font-size: 15px;
    cursor: pointer;
  }
  .x:hover {
    color: var(--ink);
  }
  .sub {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .ulist {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 8px;
    max-height: 340px;
    overflow-y: auto;
  }
  .urow {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    background: none;
    border: none;
    border-radius: 9px;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .urow:hover {
    background: var(--panel-2);
  }
  .who-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .who-row b {
    color: var(--ink);
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font: inherit;
    font-size: 0.82rem;
  }
  .col {
    margin-bottom: 6px;
  }
  .col-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-soft);
    margin-bottom: 8px;
  }
  .cnt {
    padding: 0 7px;
    border-radius: 999px;
    background: var(--panel-2);
    color: var(--ink);
    font-size: 0.72rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 6px;
    max-height: 210px;
    overflow-y: auto;
    padding: 2px;
  }
  .tile {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    padding: 4px;
    background: var(--panel-2);
    border: 2px solid var(--line);
    border-radius: 9px;
    cursor: pointer;
  }
  .tile img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .tile.sel {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--panel-2));
  }
  .swap {
    text-align: center;
    color: var(--ink-dim);
    font-size: 1.2rem;
    margin: 6px 0;
  }
  .note {
    width: 100%;
    margin-top: 12px;
    padding: 9px 11px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 9px;
    color: var(--ink);
    font: inherit;
  }
  .note:focus {
    outline: none;
    border-color: var(--accent);
  }
  .send-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 14px;
  }
  .hint {
    font-size: 0.82rem;
    color: var(--ink-dim);
  }
</style>
