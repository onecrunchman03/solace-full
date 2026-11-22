<script lang="ts">
  // Blackjack, played ON the felt: this strip is only the choices — the live
  // table (cards, bets, everyone's hands) is painted on the physical table by
  // felts.ts. The physical felt IS its engine lobby (station.lobby).
  import { bj, joinTable, leaveTable, placeBet, act, myLobbyIndex, mySeat } from "../../lib/blackjack.svelte";
  import { wallet } from "../../lib/wallet.svelte";
  import "./strip.css";
  import { deckFace } from "../../lib/emporium.svelte";
  import { session } from "../../lib/session.svelte";

  let { lobby }: { lobby: number } = $props();

  const l = $derived(bj.lobbies[lobby]);
  const seatedHere = $derived(myLobbyIndex() === lobby);
  const seatedElsewhere = $derived(myLobbyIndex() !== null && !seatedHere);
  const seat = $derived(l ? mySeat(l) : null);
  let amount = $state(0);
  $effect(() => {
    if (l && !amount) amount = l.minBet;
  });

  let now = $state(Date.now());
  $effect(() => {
    const iv = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(iv);
  });
  const secs = $derived(l?.endsAt ? Math.max(0, Math.ceil((l.endsAt - now) / 1000)) : null);

  const myTurn = $derived(
    !!l && !!seat && l.phase === "acting" && l.seats[l.activeSeat]?.user.id === seat.user.id,
  );
  const canBet = $derived(!!l && !!seat && l.phase === "betting" && seat.bet === 0);

  // YOUR HAND, spelled out. The felt shows every seat from three metres up;
  // this is the one place your own cards are unambiguous — and the round's
  // verdict gets a banner rather than a word in a chip (Josh).
  const RESULT: Record<string, { word: string; cls: string }> = {
    win: { word: "YOU WIN", cls: "win" },
    blackjack: { word: "BLACKJACK!", cls: "bj" },
    push: { word: "PUSH — bet returned", cls: "push" },
    lose: { word: "DEALER TAKES IT", cls: "lose" },
    bust: { word: "BUST", cls: "lose" },
  };
  const verdict = $derived(seat?.result ? RESULT[seat.result] : null);
  const verdict2 = $derived(seat?.split && seat.result2 ? RESULT[seat.result2] : null);
</script>

<div class="strip">
  {#if !l}
    <span class="snote">finding the table…</span>
  {:else}
    <span class="schip">{l.name} · <b>{l.minBet}–{l.maxBet}</b></span>
    <span class="schip">you <b>{wallet.coins}</b></span>
    {#if secs !== null && (l.phase === "betting" || l.phase === "acting")}
      <span class="schip">{l.phase} · <b>{secs}s</b></span>
    {/if}
    {#if !seatedHere}
      {#if seatedElsewhere}
        <span class="snote">you're seated at another table</span>
      {:else}
        <button class="sbtn hot" onclick={() => joinTable(lobby)} disabled={l.seats.every((s) => s)}>
          {l.seats.every((s) => s) ? "table full" : "SIT DOWN"}
        </button>
      {/if}
    {:else}
      {#if seat && seat.cards.length}
        <span class="myhand" class:hot={myTurn}>
          <span class="hlabel">your hand</span>
          <span class="scards">
            {#each seat.cards as bc}
              <span class="scard {deckFace(session.user?.cosmetics?.cardback)}" class:red={bc.s === "♥" || bc.s === "♦"}>{bc.r}<b>{bc.s}</b></span>
            {/each}
          </span>
          <span class="htotal">{seat.value}</span>
        </span>
        {#if seat.split}
          <span class="myhand">
            <span class="hlabel">hand 2</span>
            <span class="scards">
              {#each seat.cards2 as bc}
                <span class="scard {deckFace(session.user?.cosmetics?.cardback)}" class:red={bc.s === "♥" || bc.s === "♦"}>{bc.r}<b>{bc.s}</b></span>
              {/each}
            </span>
            <span class="htotal">{seat.value2}</span>
          </span>
        {/if}
      {/if}
      {#if canBet}
        <input class="snum" type="number" min={l.minBet} max={l.maxBet} bind:value={amount} />
        <button class="sbtn hot" onclick={() => placeBet(lobby, amount)} disabled={amount < l.minBet || amount > l.maxBet || amount > wallet.coins}>
          BET {amount}
        </button>
      {/if}
      {#if myTurn}
        <button class="sbtn hot" onclick={() => act(lobby, "hit")}>HIT</button>
        <button class="sbtn hot" onclick={() => act(lobby, "stand")}>STAND</button>
        <button class="sbtn" onclick={() => act(lobby, "double")}>DOUBLE</button>
        {#if seat?.canSplit}
          <button class="sbtn" onclick={() => act(lobby, "split")}>SPLIT</button>
        {/if}
      {/if}
      {#if verdict}
        <span class="verdict {verdict.cls}">
          {verdict.word}
          {#if seat && seat.payout > 0}<b>+{seat.payout}</b>{/if}
        </span>
      {/if}
      {#if verdict2}
        <span class="verdict {verdict2.cls}">
          hand 2 · {verdict2.word}
          {#if seat && seat.payout2 > 0}<b>+{seat.payout2}</b>{/if}
        </span>
      {/if}
      <button class="sbtn danger" onclick={() => leaveTable(lobby)}>leave seat</button>
    {/if}
    {#if bj.error}<span class="serr">{bj.error}</span>{/if}
  {/if}
</div>
