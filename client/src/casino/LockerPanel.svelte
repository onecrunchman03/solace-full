<script lang="ts">
  // THE CASINO LOCKER (Josh, Aug 2026) — reworked as a real inventory after
  // the first cut ("very lacking... no proper UI for organizing and viewing
  // items"). All FIFTY pigeonholes are drawn, and everything moves by ONE
  // gesture: PICK a thing up (click it — a carried card or a filled slot),
  // then PUT it somewhere (an empty slot stores or files it, a filled slot
  // swaps, the ON YOU shelf takes it out). Click the picked thing again to
  // put it back down.
  //
  // Server-authoritative like every drawer here: the panel renders only what
  // /api/casino/items said, and each move re-renders from the response — the
  // server refuses anything the UI shouldn't have offered.
  import { onMount } from "svelte";
  import { api, ApiError, type CasinoInvItem, type CasinoLockerItem } from "../lib/api";
  import { playSfx } from "../lib/sfx";
  import "./strips/strip.css";

  /** The floor needs to know when the CARRIED set changes — a gun stored
   *  while it's in your hand has to leave the hand. */
  let { onInvChange }: { onInvChange?: (inv: CasinoInvItem[]) => void } = $props();

  let inv = $state<CasinoInvItem[]>([]);
  let locker = $state<CasinoLockerItem[]>([]);
  let slots = $state(50);
  let busy = $state(false);
  let note = $state<{ text: string; bad?: boolean } | null>(null);
  /** What's picked up: a carried item, or a locker slot. Null = open hand. */
  let held = $state<{ kind: "inv"; item: string } | { kind: "locker"; slot: number } | null>(null);

  const say = (text: string, bad = false): void => {
    note = { text, bad };
    setTimeout(() => (note = null), 3200);
  };

  const NAMES: Record<string, string> = { gun: "Casino Gun", clip: "Spare clip" };
  const name = (item: string): string => NAMES[item] ?? item;
  const glyph = (item: string): string => (item === "gun" ? "🔫" : item === "clip" ? "▮▮" : "▪");
  /** The gun's qty is its LOAD; a clip stack's is a count. */
  const detail = (item: string, qty: number): string =>
    item === "gun" ? `${qty}/9 loaded` : `×${qty}`;

  const bySlot = $derived(new Map(locker.map((s) => [s.slot, s])));
  const used = $derived(locker.length);

  const apply = (r: { inv: CasinoInvItem[]; locker: CasinoLockerItem[] }): void => {
    inv = r.inv;
    locker = r.locker;
    onInvChange?.(r.inv);
  };

  onMount(async () => {
    try {
      const r = await api.casinoItems();
      inv = r.inv;
      locker = r.locker;
      slots = r.slots;
    } catch {
      say("the locker jammed — try again", true);
    }
  });

  const errText = (e: unknown): string => {
    const code = e instanceof ApiError ? e.code : "";
    return code === "locker_full" ? "every pigeonhole is taken"
      : code === "slot_taken" ? "that pigeonhole is taken"
      : "the locker refused it";
  };

  /** Click a CARRIED card: pick it up (or put it back down). */
  const clickInv = (item: string): void => {
    if (busy) return;
    if (held?.kind === "inv" && held.item === item) {
      held = null;
      return;
    }
    // holding a locker slot and clicking the shelf = take it out (below);
    // holding nothing (or another carried item) = pick this one up
    if (held?.kind === "locker") {
      void takeOut(held.slot);
      return;
    }
    held = { kind: "inv", item };
  };

  /** Click the ON YOU shelf itself while holding a locker slot: withdraw. */
  const clickShelf = (): void => {
    if (busy || held?.kind !== "locker") return;
    void takeOut(held.slot);
  };

  const takeOut = async (slot: number): Promise<void> => {
    busy = true;
    held = null;
    try {
      apply(await api.casinoTake(slot));
      playSfx("chip-place", 0.5);
    } catch (e) {
      say(errText(e), true);
    }
    busy = false;
  };

  /** Click a GRID slot with whatever's in hand. */
  const clickSlot = async (slot: number): Promise<void> => {
    if (busy) return;
    const there = bySlot.get(slot);
    if (!held) {
      if (!there) return; // empty hand, empty slot — nothing to do
      held = { kind: "locker", slot };
      return;
    }
    if (held.kind === "inv") {
      // store the carried item INTO this pigeonhole (server refuses a taken
      // one — except a same-item clip stack, which merges)
      const item = held.item;
      busy = true;
      held = null;
      try {
        apply(await api.casinoStore(item, 1, slot));
        playSfx("chip-place", 0.5);
      } catch (e) {
        say(errText(e), true);
      }
      busy = false;
      return;
    }
    // holding a locker slot: same slot puts it down; any other moves/swaps
    if (held.slot === slot) {
      held = null;
      return;
    }
    const from = held.slot;
    busy = true;
    held = null;
    try {
      apply(await api.casinoMove(from, slot));
      playSfx("chip-place", 0.4);
    } catch (e) {
      say(errText(e), true);
    }
    busy = false;
  };

  const hint = $derived(
    held === null
      ? "click an item to pick it up"
      : held.kind === "inv"
        ? `holding ${name(held.item)} — click a pigeonhole to store it`
        : `holding slot ${held.slot + 1} — click a pigeonhole to move it, or ON YOU to take it out`,
  );
</script>

<div class="strip lockerp">
  <div class="lkhead">
    <span class="schip">THE CASINO LOCKER</span>
    <span class="schip">{used}/{slots} slots</span>
    <span class="lkhint">{hint}</span>
    {#if note}<span class={note.bad ? "serr" : "snote"}>{note.text}</span>{/if}
  </div>

  <div class="lkbody">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="lkshelf" role="button" tabindex="-1" class:droppable={held?.kind === "locker"} onclick={clickShelf}>
      <span class="lktitle">ON YOU</span>
      {#if !inv.length}
        <span class="snote">nothing but lint</span>
      {:else}
        {#each inv as it (it.item)}
          <button
            class="lkcard"
            class:held={held?.kind === "inv" && held.item === it.item}
            disabled={busy}
            onclick={(e) => { e.stopPropagation(); clickInv(it.item); }}
          >
            <span class="lkglyph">{glyph(it.item)}</span>
            <span class="lkname">{name(it.item)}</span>
            <span class="lkdetail">{detail(it.item, it.qty)}</span>
          </button>
        {/each}
      {/if}
      {#if held?.kind === "locker"}
        <span class="lkdrop">↓ take it out</span>
      {/if}
    </div>

    <div class="lkgrid">
      {#each Array.from({ length: slots }, (_, i) => i) as s (s)}
        {@const it = bySlot.get(s)}
        <button
          class="lkslot"
          class:full={!!it}
          class:held={held?.kind === "locker" && held.slot === s}
          class:target={held !== null && (!it || (held.kind === "inv" && it.item === held.item && it.item !== "gun"))}
          disabled={busy}
          title={it ? `${name(it.item)} — ${detail(it.item, it.qty)}` : `slot ${s + 1}`}
          onclick={() => clickSlot(s)}
        >
          <span class="lknum">{s + 1}</span>
          {#if it}
            <span class="lkg">{glyph(it.item)}</span>
            <span class="lkq">{it.item === "gun" ? `${it.qty}/9` : `×${it.qty}`}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .lockerp {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }
  .lkhead {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .lkhint {
    color: #9a8a68;
    font: 600 11px system-ui, sans-serif;
  }
  .lkbody {
    display: flex;
    gap: 10px;
    align-items: stretch;
  }
  .lkshelf {
    flex: 0 0 172px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    background: #00000055;
    border: 1px solid #3a3428;
    border-radius: 12px;
  }
  .lkshelf.droppable {
    border-color: #e8c33c;
    background: #2a220e66;
    cursor: pointer;
  }
  .lktitle {
    color: #9a8a68;
    font: 800 10px system-ui, sans-serif;
    letter-spacing: 0.14em;
  }
  .lkcard {
    display: grid;
    grid-template-columns: 26px 1fr;
    grid-template-rows: auto auto;
    column-gap: 7px;
    align-items: center;
    text-align: left;
    padding: 7px 9px;
    background: #1b1610;
    border: 1px solid #4a3f2c;
    border-radius: 9px;
    cursor: pointer;
  }
  .lkcard:hover { border-color: #8a7448; }
  .lkcard.held {
    border-color: #e8c33c;
    background: #3a2d12;
    box-shadow: 0 0 0 1px #e8c33c55;
  }
  .lkglyph { grid-row: span 2; font-size: 16px; }
  .lkname { color: #e6dcc2; font: 700 12px system-ui, sans-serif; }
  .lkdetail { color: #9a8a68; font: 600 10px system-ui, sans-serif; }
  .lkdrop {
    margin-top: auto;
    text-align: center;
    color: #e8c33c;
    font: 700 11px system-ui, sans-serif;
  }
  .lkgrid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 4px;
  }
  .lkslot {
    position: relative;
    min-height: 44px;
    background: #14100a;
    border: 1px solid #2e281e;
    border-radius: 8px;
    color: #e6dcc2;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding: 3px 2px;
  }
  .lkslot:hover { border-color: #6a5838; }
  .lkslot.full {
    background: #1e1810;
    border-color: #4a3f2c;
  }
  .lkslot.held {
    border-color: #e8c33c;
    background: #3a2d12;
    box-shadow: 0 0 0 1px #e8c33c55;
  }
  .lkslot.target:hover {
    border-color: #e8c33c;
    background: #241d10;
  }
  .lknum {
    position: absolute;
    top: 2px;
    left: 4px;
    color: #5e5442;
    font: 800 8px system-ui, sans-serif;
  }
  .lkg { font-size: 13px; line-height: 1; }
  .lkq { color: #b8a87e; font: 700 9px system-ui, sans-serif; }
  @media (max-width: 900px) {
    .lkbody { flex-direction: column; }
    .lkshelf { flex: none; flex-direction: row; flex-wrap: wrap; align-items: center; }
    .lkgrid { grid-template-columns: repeat(5, 1fr); }
  }
</style>
