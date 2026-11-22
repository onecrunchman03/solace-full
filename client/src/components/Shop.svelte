<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { wallet, sellEmoji, buySpins, sellValue, buyFromSterling, buyTalismanSilver } from "../lib/wallet.svelte";
  import { emoji, refreshOwned } from "../lib/emoji.svelte";
  import { api, ApiError, type ShelfRow } from "../lib/api";
  import { wheel, loadWheel } from "../lib/wheel.svelte";
  import { session } from "../lib/session.svelte";
  import { emporium, loadEmporium, buyItem, equip } from "../lib/emporium.svelte";
  import { prefs, THEMES, setTheme, startThemePreview, type ThemeId } from "../lib/prefs.svelte";
  import { chaChing, sterlingMurmur } from "../lib/shop-audio";
import { playSfx } from "../lib/sfx";
import { sterlingLinePool, gatherSterlingCtx } from "../lib/sterling-lines";
import { takeIdle, primeIdle, voiceReact } from "../lib/npcvoice";
  import { pickFresh } from "../lib/linepick";
import { loadLender } from "../lib/lender.svelte";
  import type { EmporiumItem, Emoji as EmojiRow } from "../lib/api";
  import Coin from "./Coin.svelte";
  import VipRoom from "./VipRoom.svelte";
  import { myVipRank } from "../lib/vip.svelte";

  const MAX_BUY = 50;

  type Tab = "sell" | "spins" | "emporium" | "vip";
  let tab = $state<Tab>("sell");
  let msg = $state("");
  let err = $state("");

  onMount(() => {
    void loadWheel(); // so "spins available" is current
    void loadEmporium();
    void loadLender(); // so Sterling knows whether you owe the goblins
  });

  // ---- Sterling: dynamic, per-user dialogue + a robot murmur voice ----
  // Lines are generated from what the client actually knows about YOU: name,
  // wallet, collection size, talisman, equipped theme, owned items, the hour.
  let sterlingLine = $state("…");
  let talking = $state(false);
  let talkTimer: ReturnType<typeof setTimeout> | undefined;
  let rotateTimer: ReturnType<typeof setInterval> | undefined;

  // STERLING'S ONE BRAIN (lib/sterling-lines.ts, Aug 2026): this counter now
  // speaks from the same centralized pool his 3D instances draw on — venue
  // "shop" — which is also where his goblin-debt disdain lives.
  const linePool = (): string[] => sterlingLinePool("shop", gatherSterlingCtx());

  /** Sterling delivers a line: text + murmur + mouth animation. */
  function show(line: string): void {
    sterlingLine = line;
    const dur = sterlingMurmur(line);
    if (dur > 0) {
      talking = true;
      clearTimeout(talkTimer);
      talkTimer = setTimeout(() => (talking = false), dur);
    }
  }
  /** A REACTION (THE HOUSE'S BRAINS, lib/npcvoice.ts): with `event` — what
   *  the customer just did, from his side of the counter — the model writes
   *  the line and `line` is only the example of tone (and the fallback).
   *  Without one, the line is said as written. */
  function say(line: string, event?: string): void {
    if (!event) return show(line);
    void voiceReact("sterling", tab === "vip" ? "vip" : "shop", line, event).then(show);
  }
  /** Counter talk: written for this customer by the model; the scripted pool
   *  only when no batch is to hand. Never the line he just said. */
  function sayRandom(): void {
    show(takeIdle("sterling", "shop") ?? pickFresh("sterling:shop", linePool()));
  }

  const PURCHASE_LINES = [
    "An impeccable choice. I'll wrap it in velvet.",
    "Sold! The mint thanks you for your service.",
    "Exquisite. It suits you better than it suited the shelf.",
  ];

  // A word for each counter as you step up to it.
  const TAB_LINES: Record<Tab, string[]> = {
    sell: ["Lay them on the counter — I pay in honest silver.", "Selling, are we? Mind the fingerprints.", "Fresh stock on the shelves every midnight. Get it before the day does."],
    spins: ["Spins for silver. The Wheel and I have an arrangement.", "Feeling lucky? That's exactly how the house likes you."],
    emporium: ["The velvet catalog, as promised. Browse slowly.", "Everything on these shelves judges you right back."],
    // THE VIP ROOM speaks from his central pool (venue "vip") — see setTab.
    vip: [],
  };
  function setTab(t: Tab): void {
    if (t === "vip" && tab !== t) {
      tab = t;
      msg = "";
      err = "";
      void primeIdle("sterling", "vip", 4_000).then((ai) =>
        show(ai ?? (pickFresh("sterling:vip", sterlingLinePool("vip", gatherSterlingCtx())) || "Members only.")),
      );
      return;
    }
    if (tab === t) return;
    tab = t;
    msg = "";
    err = "";
    const lines = TAB_LINES[t];
    const counter = t === "sell" ? "the counter where you buy emoji" : t === "spins" ? "the Wheelwright's counter (bonus spins, the talisman)" : "the Emporium's catalog of cosmetics";
    say(lines[Math.floor(Math.random() * lines.length)], `stepped up to ${counter}`);
  }

  $effect(() => {
    // First greeting once the shop data lands, then a slow rotation. The
    // interval must depend ONLY on `emporium.loading`: the old version also
    // read sterlingLine, so the greeting's own write re-ran the effect and
    // its cleanup killed the just-created interval — Sterling delivered one
    // line and never rotated again.
    if (emporium.loading) return;
    untrack(() => {
      // The first greeting only — and worth a moment's wait for a line
      // written for this customer (he stands there with "…" meanwhile).
      if (sterlingLine === "…") void primeIdle("sterling", "shop").then((ai) => show(ai ?? pickFresh("sterling:shop", linePool())));
    });
    rotateTimer = setInterval(sayRandom, 22_000);
    return () => {
      clearInterval(rotateTimer);
      clearTimeout(talkTimer);
    };
  });

  // React to a purchase the moment it happens — but not to one remembered
  // from a previous visit (lastBought persists in the store, and replaying
  // "Sold!" as the greeting reads wrong).
  let seenBought = emporium.lastBought;
  $effect(() => {
    if (emporium.lastBought && emporium.lastBought !== seenBought) {
      const bought = emporium.items.find((i) => i.id === emporium.lastBought)?.name ?? "something";
      say(PURCHASE_LINES[emporium.lastBought.length % PURCHASE_LINES.length], `bought "${bought}" from your Emporium`);
    }
    seenBought = emporium.lastBought;
  });

  const KIND_LABELS: Record<string, string> = {
    theme: "App Themes",
    border: "Profile Borders",
    flair: "Name Flair",
    banner: "Profile Banners",
    cardback: "Card Backs",
    dice: "Dice Skins",
    tombstone: "Tombstones",
    epitaph: "Epitaph Scripts",
    title: "Titles",
  };
  const KIND_ICONS: Record<string, string> = {
    theme: "🎨",
    border: "⭕",
    flair: "✨",
    banner: "🖼️",
    cardback: "🂠",
    dice: "🎲",
    tombstone: "🪦",
    epitaph: "🖋️",
    title: "🏷️",
  };
  // Chime + bubble left the catalog with migration 48 — a dead department
  // chip rendered a blank shelf with no explanation.
  const KIND_ORDER = [
    "theme", "border", "flair", "banner",
    "cardback", "dice", "tombstone", "epitaph", "title",
  ];
  /** Emporium department filter — "all" or one kind. */
  let ecat = $state<string>("all");

  // Restock countdown (UTC midnight shelf flip).
  let nowTick = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (nowTick = Date.now()), 30_000);
    return () => clearInterval(t);
  });
  const restockIn = $derived.by(() => {
    const ms = Math.max(0, emporium.restockAt - nowTick);
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  });
  const itemGroups = $derived(
    KIND_ORDER.filter((k) => ecat === "all" || ecat === k).map((k) => ({
      kind: k,
      label: KIND_LABELS[k],
      // Cheapest first — browsing reads like a price ladder.
      items: emporium.items
        .filter((i) => i.kind === k)
        .slice()
        .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name)),
    })).filter((g) => g.items.length > 0),
  );

  /** Owned themes are wearable straight from the shelf. */
  function wearTheme(i: EmporiumItem): void {
    const id = i.id.replace(/^theme-/, "") as ThemeId;
    setTheme(id);
    say(`A fine choice. The room suits you already.`, `put on the ${i.name} theme, one they own`);
  }

  function tryTheme(i: EmporiumItem): void {
    startThemePreview(i.id.replace(/^theme-/, "") as ThemeId);
    say(`Try it on, try it on. No obligation. Some pressure.`, `is trying on the ${i.name} theme for 20 seconds before deciding whether to buy it`);
  }

  function equipSlotOf(i: EmporiumItem): string | null {
    return i.kind === "theme" ? null : i.kind;
  }
  function isEquipped(i: EmporiumItem): boolean {
    const slot = equipSlotOf(i);
    return !!slot && emporium.cosmetics[slot as keyof typeof emporium.cosmetics] === i.id;
  }
  async function onItemAction(i: EmporiumItem) {
    if (!i.owned) {
      await buyItem(i.id);
      return;
    }
    const slot = equipSlotOf(i);
    if (slot) await equip(slot, isEquipped(i) ? null : i.id);
  }

  // ---- the Emojis counter: SELL to Sterling, or BUY off his shelves ----
  // (Josh, Sep 2026: what he buys BURNS; what he sells is a fixed daily
  // spread — one legendary up top, three rares, six commons — the same for
  // everyone, one of each per person per UTC day. The silver he takes burns.
  // The sell-back-at-double shelf was a mythic faucet through the Forge.)
  type Mode = "sell" | "buy";
  let mode = $state<Mode>("sell");
  let sel = $state<Set<string>>(new Set());
  let confirming = $state(false);
  let selling = $state(false);

  const TIER_COLOR: Record<string, string> = {
    talisman: "#42c1c4", mythic: "#ff5db1", legendary: "#f39620", rare: "#9d63d2", common: "#7cae5f",
  };
  const TIER_ORDER = ["legendary", "rare", "common"];

  // The shelves
  let shelves = $state<ShelfRow[]>([]);
  let shelfRestockAt = $state(0);
  let stockLoaded = $state(false);
  let bsel = $state<Set<string>>(new Set());
  let shelfBuying = $state(false);
  async function loadStock(): Promise<void> {
    try {
      const r = await api.sterlingStock();
      shelves = r.shelves;
      shelfRestockAt = r.restockAt;
    } catch {
      /* best-effort */
    }
    stockLoaded = true;
  }
  const SHELF_NAME: Record<string, string> = { legendary: "Top shelf", rare: "Middle shelf", common: "Bottom shelf" };
  const shelfRestockIn = $derived.by(() => {
    const ms = Math.max(0, shelfRestockAt - nowTick);
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  });
  const ownedSet = $derived(new Set(emoji.owned.map((e) => e.code)));
  const stock = $derived(shelves.flatMap((s) => s.items));
  const bselTotal = $derived([...bsel].reduce((n, c) => n + (stock.find((e) => e.code === c)?.price ?? 0), 0));
  function btoggle(code: string): void {
    if (ownedSet.has(code) || stock.find((e) => e.code === code)?.bought) return;
    const next = new Set(bsel);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    bsel = next;
    msg = "";
    err = "";
  }
  function setMode(m: Mode): void {
    if (mode === m) return;
    mode = m;
    msg = "";
    err = "";
    confirming = false;
    if (m === "buy") {
      void loadStock();
      say("The shelves. A fresh spread every midnight — one of each, per customer.", "turned to your shelves of emoji for sale — a fresh spread every midnight, one of each per customer");
    }
  }
  async function buyShelf(): Promise<void> {
    if (!bsel.size || shelfBuying) return;
    shelfBuying = true;
    err = "";
    const codes = [...bsel];
    const r = await buyFromSterling(codes);
    shelfBuying = false;
    if (r.ok) {
      msg = `Bought ${r.got.length} emoji for ${r.spent} silver.`;
      bsel = new Set();
      chaChing();
      say(`${r.spent} silver. Off the shelf and into your pocket.`, `bought ${r.got.length} emoji off your shelves for ${r.spent} silver`);
      void loadStock();
    } else {
      err =
        r.error === "insufficient" ? "Not enough silver." :
        r.error === "not_in_stock" ? "That one isn't on today's shelf." :
        r.error === "already_bought" ? "You already bought that one today." :
        r.error === "already_owned" ? "You already own one of those." :
        "Sterling shook his head — nothing was bought.";
      void loadStock();
    }
  }

  const sellGroups = $derived(
    TIER_ORDER.map((t) => ({
      tier: t,
      items: sellable.filter((e) => e.tier === t).slice().sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.items.length),
  );

  const sellable = $derived(
    emoji.owned
      .filter((e) => sellValue(e.tier) > 0)
      .slice()
      .sort((a, b) => sellValue(b.tier) - sellValue(a.tier) || a.name.localeCompare(b.name)),
  );
  const hasUnsellable = $derived(emoji.owned.some((e) => sellValue(e.tier) <= 0));
  const selTotal = $derived([...sel].reduce((n, code) => n + sellValue(tierOf(code)), 0));

  function tierOf(code: string): string {
    return emoji.owned.find((e) => e.code === code)?.tier ?? "";
  }
  function toggle(code: string) {
    const next = new Set(sel);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    sel = next;
    confirming = false;
    msg = "";
    err = "";
  }
  function clearSel() {
    sel = new Set();
    confirming = false;
  }

  async function doSell() {
    if (sel.size === 0 || selling) return;
    if (!confirming) {
      confirming = true;
      return;
    }
    selling = true;
    err = "";
    const n = sel.size;
    const r = await sellEmoji([...sel]);
    selling = false;
    confirming = false;
    if (r.ok) {
      msg = `Sold ${n} emoji for ${r.gained} silver.`;
      sel = new Set();
      chaChing();
      say(`Cha-ching. ${r.gained} silver, honestly earned — by me.`, `sold you ${n} emoji, and you paid them ${r.gained} silver`);
      if (stockLoaded) void loadStock();
    } else {
      err = r.error === "not_owned" ? "You no longer own one of those." : "Couldn't complete the sale.";
    }
  }

  // ---- buy spins ----
  let qty = $state(1);
  let buying = $state(false);

  const cost = $derived(qty * wallet.spinPrice);
  const canAfford = $derived(wallet.coins >= cost);

  function setQty(n: number) {
    qty = Math.max(1, Math.min(MAX_BUY, Math.floor(n) || 1));
    msg = "";
    err = "";
  }

  async function doBuy() {
    if (buying || !canAfford) return;
    buying = true;
    err = "";
    const r = await buySpins(qty);
    if (r.ok) {
      msg = `Bought ${qty} Wheel spin${qty > 1 ? "s" : ""}. You now have ${r.spins}.`;
      await loadWheel();
    } else {
      err = r.error === "insufficient" ? "Not enough silver." : "Couldn't buy spins.";
    }
    buying = false;
  }

  // ---- the talisman trade (one mythic → the death shield) ----
  let sacrificing = $state<string | null>(null); // mythic code pending confirm
  let trading = $state(false);

  const myMythics = $derived(emoji.owned.filter((e) => e.tier === "mythic"));
  const shielded = $derived(emoji.owned.some((e) => e.tier === "talisman"));

  async function doTalismanTrade() {
    if (!sacrificing || trading) return;
    trading = true;
    err = "";
    try {
      await api.buyTalisman(sacrificing);
      playSfx("forge", 0.6); // the carve at the Wheelwright's bench
      msg = "The house takes its due. You are warded — the reaper will blink once.";
      say("A mythic for your life. The fairest trade I offer.", "gave up one of their mythic emoji in exchange for a talisman — the death shield that takes the reaper's blow instead of them");
      sacrificing = null;
      await Promise.all([refreshOwned(), loadWheel()]);
    } catch (e) {
      err =
        e instanceof ApiError && e.code === "already_shielded"
          ? "You already carry a talisman — one shield per soul."
          : e instanceof ApiError && e.code === "not_owned"
            ? "You no longer own that mythic."
            : "The trade fell through.";
      sacrificing = null;
    } finally {
      trading = false;
    }
  }

  // ---- the shield for SILVER ----
  // This counter used to exist only inside the 3D casino (SterlingShop.svelte
  // was the sole caller of /api/shop/talisman-silver), so the one purchase
  // that saves a life meant loading a WebGL hall and walking to a prop. The
  // panic button belongs at the ordinary counter too.
  //
  // It DOES reach phones since the phone's second round (Sep 2026): `market`
  // and `rumble` are both in PHONE_VIEWS now, so the gauge, the Wheel and
  // this counter are all one tap apart on a phone — which closes the gap
  // where a courtesy DM could be read on a device that couldn't act on it.
  let buyingShield = $state(false);
  async function doTalismanSilver() {
    if (buyingShield) return;
    buyingShield = true;
    err = "";
    const r = await buyTalismanSilver();
    if (r.ok) {
      msg = "The amulet is yours. Wear it — the reaper takes it instead of you.";
      say("Carved, blessed and sold. I'd rather you never find out if it works.", "bought a talisman from you for silver — the death shield that takes the reaper's blow instead of them");
      await Promise.all([refreshOwned(), loadWheel()]);
    } else if (r.error !== "cancelled") {
      err =
        r.error === "insufficient"
          ? "Not enough silver for the shield."
          : r.error === "already_shielded"
            ? "You already carry a talisman — one shield per soul."
            : "The counter refused the sale.";
    }
    buyingShield = false;
  }
</script>

<div class="shop">
  <!-- ---- Sterling's workshop: he greets you first; the counters below are
       tabbed (Sell / Wheel Spins / Emporium). ---- -->
  <div class="workshop">
    <!-- backdrop: wall shelves of jars, bottles and curios behind the counter -->
    <svg class="shelfscene" viewBox="0 0 720 210" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="shelfwood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7a5124" /><stop offset="1" stop-color="#4c2f10" />
        </linearGradient>
        <radialGradient id="potion" cx="0.5" cy="0.35" r="0.8">
          <stop offset="0" stop-color="#9fe8c4" /><stop offset="1" stop-color="#2c7a5a" />
        </radialGradient>
      </defs>
      <g opacity="0.5">
        <!-- upper shelf -->
        <rect x="18" y="78" width="250" height="7" rx="2" fill="url(#shelfwood)" />
        <rect x="34" y="46" width="16" height="32" rx="3" fill="#8a5a7a" opacity="0.8" />
        <rect x="56" y="52" width="12" height="26" rx="5" fill="url(#potion)" />
        <rect x="74" y="40" width="20" height="38" rx="3" fill="#5a6f8f" opacity="0.75" />
        <rect x="102" y="56" width="14" height="22" rx="2" fill="#a8742c" />
        <ellipse cx="109" cy="55" rx="8" ry="3" fill="#c89440" />
        <g transform="rotate(-8 150 70)"><rect x="140" y="46" width="9" height="32" rx="1.5" fill="#7a3b2c" /></g>
        <rect x="152" y="44" width="9" height="34" rx="1.5" fill="#3b5a48" />
        <rect x="163" y="48" width="9" height="30" rx="1.5" fill="#6b5424" />
        <circle cx="205" cy="62" r="14" fill="none" stroke="#c8a052" stroke-width="3" />
        <circle cx="205" cy="62" r="4" fill="#c8a052" />
        <rect x="232" y="50" width="18" height="28" rx="8" fill="#4c7a8a" opacity="0.8" />
        <!-- lower shelf -->
        <rect x="18" y="150" width="220" height="7" rx="2" fill="url(#shelfwood)" />
        <rect x="36" y="120" width="22" height="30" rx="4" fill="#87683a" />
        <ellipse cx="47" cy="119" rx="12" ry="4" fill="#a8854c" />
        <rect x="70" y="126" width="13" height="24" rx="5" fill="#8a3b5a" opacity="0.8" />
        <rect x="90" y="114" width="26" height="36" rx="3" fill="#42586e" opacity="0.7" />
        <rect x="126" y="128" width="12" height="22" rx="5" fill="url(#potion)" />
        <g transform="rotate(6 160 140)"><rect x="150" y="118" width="10" height="32" rx="1.5" fill="#6e3b24" /></g>
        <rect x="168" y="122" width="10" height="28" rx="1.5" fill="#2c4a6e" />
        <!-- right wall: hanging scales + keys (the bubble sits over most of this) -->
        <line x1="640" y1="30" x2="640" y2="58" stroke="#c8a052" stroke-width="2.5" />
        <path d="M620 58 L660 58 M620 58 q0 12 12 12 q12 0 12 -12 M636 58 q0 12 12 12 q12 0 12 -12" fill="none" stroke="#c8a052" stroke-width="2.5" opacity="0.9" />
        <circle cx="688" cy="44" r="7" fill="none" stroke="#a8854c" stroke-width="3" />
        <rect x="686" y="50" width="4" height="16" rx="1.5" fill="#a8854c" />
      </g>
    </svg>
    <div class="lamps"><span class="lamp l1"></span><span class="lamp l2"></span></div>

    <!-- Sterling v3: shaded copper, brass goggles, wire mustache, waistcoat
         panel + pocket-watch chain, jointed arms resting on the counter. -->
    <svg class="sterling3" viewBox="0 0 190 210" aria-hidden="true" class:talking>
      <defs>
        <linearGradient id="st-cu" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#dd9558" /><stop offset="0.55" stop-color="#bd7434" /><stop offset="1" stop-color="#94521e" />
        </linearGradient>
        <linearGradient id="st-cud" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#a76428" /><stop offset="1" stop-color="#713d12" />
        </linearGradient>
        <linearGradient id="st-br" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f2d084" /><stop offset="1" stop-color="#a87c34" />
        </linearGradient>
        <linearGradient id="st-felt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#54381a" /><stop offset="1" stop-color="#2b1c0a" />
        </linearGradient>
        <radialGradient id="st-lens" cx="0.4" cy="0.35" r="0.9">
          <stop offset="0" stop-color="#c4f6fd" /><stop offset="0.6" stop-color="#54d2e2" /><stop offset="1" stop-color="#1e93a6" />
        </radialGradient>
        <linearGradient id="st-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#77501f" /><stop offset="1" stop-color="#4a2d10" />
        </linearGradient>
      </defs>

      <g class="robo">
        <!-- antenna -->
        <line x1="122" y1="20" x2="130" y2="6" stroke="#8a5a28" stroke-width="3" stroke-linecap="round" />
        <circle cx="131" cy="5" r="4" fill="#ffd98f" stroke="#4c2e10" stroke-width="1.6" class="bobble" />
        <!-- top hat: tapered crown, brass band + buckle, oval brim -->
        <path d="M58 8 L112 8 L109 34 L61 34 Z" fill="url(#st-felt)" stroke="#1c1206" stroke-width="2.5" />
        <rect x="61" y="24" width="48" height="9" fill="url(#st-br)" stroke="#4c2e10" stroke-width="1.4" />
        <rect x="80" y="25.5" width="9" height="6" rx="1" fill="none" stroke="#4c2e10" stroke-width="1.6" />
        <rect x="46" y="33" width="78" height="9" rx="4.5" fill="url(#st-felt)" stroke="#1c1206" stroke-width="2.5" />
        <ellipse cx="76" cy="14" rx="12" ry="4" fill="#fff" opacity="0.08" />
        <!-- head -->
        <rect x="52" y="46" width="66" height="52" rx="16" fill="url(#st-cu)" stroke="#4c2e10" stroke-width="3" />
        <ellipse cx="72" cy="58" rx="13" ry="7" fill="#fff" opacity="0.14" />
        <circle cx="50" cy="70" r="3.6" fill="url(#st-br)" stroke="#4c2e10" stroke-width="1.4" />
        <circle cx="120" cy="70" r="3.6" fill="url(#st-br)" stroke="#4c2e10" stroke-width="1.4" />
        <!-- goggles: strap, brass rims, glowing glass with a specular dot -->
        <rect x="52" y="61" width="66" height="5" fill="#3a2410" opacity="0.65" />
        <circle cx="71" cy="64" r="11.5" fill="#16211f" stroke="url(#st-br)" stroke-width="4" />
        <circle cx="99" cy="64" r="11.5" fill="#16211f" stroke="url(#st-br)" stroke-width="4" />
        <rect x="80" y="61" width="10" height="5.5" rx="2.4" fill="url(#st-br)" />
        <line x1="112" y1="55" x2="117" y2="50" stroke="#a87c34" stroke-width="3" stroke-linecap="round" />
        <circle cx="71" cy="64" r="6" fill="url(#st-lens)" class="lens" />
        <circle cx="99" cy="64" r="6" fill="url(#st-lens)" class="lens" />
        <circle cx="69" cy="61.5" r="1.7" fill="#fff" opacity="0.9" />
        <circle cx="97" cy="61.5" r="1.7" fill="#fff" opacity="0.9" />
        <!-- brass wire mustache -->
        <path d="M66 82 Q76 89 85 83 Q94 89 104 82" fill="none" stroke="url(#st-br)" stroke-width="3" stroke-linecap="round" />
        <circle cx="65" cy="81" r="2" fill="#e0b45c" />
        <circle cx="105" cy="81" r="2" fill="#e0b45c" />
        <!-- mouth grill: glow behind slats, animated while talking -->
        <rect x="73" y="86" width="24" height="9.5" rx="4" fill="#1a1208" stroke="#4c2e10" stroke-width="1.8" />
        <rect x="75" y="88" width="20" height="5.5" rx="2.5" fill="#ffcf4a" class="mouth" />
        <g stroke="#1a1208" stroke-width="1.6">
          <line x1="79" y1="87" x2="79" y2="95" /><line x1="85" y1="87" x2="85" y2="95" /><line x1="91" y1="87" x2="91" y2="95" />
        </g>
        <!-- neck -->
        <rect x="78" y="98" width="14" height="8" fill="url(#st-cud)" />
        <!-- torso: copper shell, waistcoat panel, buttons, watch chain, gear window -->
        <path d="M46 106 Q85 96 124 106 L120 166 Q85 178 50 166 Z" fill="url(#st-cu)" stroke="#4c2e10" stroke-width="3" />
        <path d="M60 106 Q85 100 110 106 L107 162 Q85 170 63 162 Z" fill="url(#st-cud)" opacity="0.5" />
        <circle cx="64" cy="116" r="2.2" fill="url(#st-br)" />
        <circle cx="64" cy="128" r="2.2" fill="url(#st-br)" />
        <circle cx="64" cy="140" r="2.2" fill="url(#st-br)" />
        <path d="M92 112 Q108 120 110 132" fill="none" stroke="#e0b45c" stroke-width="2" stroke-dasharray="0.5 4" stroke-linecap="round" />
        <circle cx="110" cy="134" r="4.5" fill="url(#st-br)" stroke="#4c2e10" stroke-width="1.4" />
        <circle cx="85" cy="136" r="17" fill="#e9f2ec" stroke="url(#st-br)" stroke-width="4" />
        <path d="M73 128 A17 17 0 0 1 91 121" fill="none" stroke="#fff" stroke-width="3" opacity="0.5" stroke-linecap="round" />
        <g class="gear">
          <circle cx="85" cy="136" r="7.5" fill="none" stroke="#6f9a8c" stroke-width="3" />
          {#each [0, 60, 120, 180, 240, 300] as a}
            <rect x="83.5" y="124" width="3" height="6" fill="#6f9a8c" transform="rotate({a} 85 136)" />
          {/each}
        </g>
        <!-- shoulders + two-segment arms with elbow rivets, hands on the counter -->
        <circle cx="48" cy="110" r="5" fill="url(#st-br)" stroke="#4c2e10" stroke-width="2" />
        <circle cx="122" cy="110" r="5" fill="url(#st-br)" stroke="#4c2e10" stroke-width="2" />
        <path d="M46 112 Q33 120 32 136" fill="none" stroke="url(#st-cu)" stroke-width="9" stroke-linecap="round" />
        <path d="M32 136 Q33 150 42 158" fill="none" stroke="url(#st-cud)" stroke-width="8" stroke-linecap="round" />
        <circle cx="32" cy="136" r="4" fill="url(#st-br)" stroke="#4c2e10" stroke-width="1.6" />
        <path d="M124 112 Q137 120 138 136" fill="none" stroke="url(#st-cu)" stroke-width="9" stroke-linecap="round" />
        <path d="M138 136 Q137 150 128 158" fill="none" stroke="url(#st-cud)" stroke-width="8" stroke-linecap="round" />
        <circle cx="138" cy="136" r="4" fill="url(#st-br)" stroke="#4c2e10" stroke-width="1.6" />
        <!-- three-finger hands resting on the counter edge -->
        <g fill="url(#st-cu)" stroke="#4c2e10" stroke-width="1.6">
          <rect x="38" y="156" width="5" height="9" rx="2.4" /><rect x="44" y="157" width="5" height="9" rx="2.4" /><rect x="50" y="156" width="5" height="8" rx="2.4" />
          <rect x="124" y="156" width="5" height="8" rx="2.4" /><rect x="130" y="157" width="5" height="9" rx="2.4" /><rect x="136" y="156" width="5" height="9" rx="2.4" />
        </g>
      </g>

      <!-- counter with brass trim + a little stack of silver -->
      <rect x="8" y="162" width="174" height="16" rx="4" fill="url(#st-wood)" stroke="#2c1a08" stroke-width="2.5" />
      <line x1="12" y1="165" x2="178" y2="165" stroke="#c8a052" stroke-width="1.4" opacity="0.6" />
      <rect x="14" y="178" width="162" height="24" rx="3" fill="#4a2d12" stroke="#2c1a08" stroke-width="2" />
      <rect x="88" y="184" width="14" height="12" rx="2" fill="none" stroke="#c8a052" stroke-width="1.4" opacity="0.4" />
      <g stroke="#8a8f9a" stroke-width="1">
        <ellipse cx="160" cy="160" rx="9" ry="3" fill="#d4d7de" />
        <ellipse cx="160" cy="156.5" rx="9" ry="3" fill="#c2c6cf" />
        <ellipse cx="160" cy="153" rx="9" ry="3" fill="#dfe2e8" />
      </g>
    </svg>

    <div class="bubble2" class:talking>
      <span class="keeper">STERLING · PROPRIETOR</span>
      <p>{sterlingLine}</p>
      <div class="bal-line">
        Your purse: <Coin size={13} /> <b>{wallet.coins.toLocaleString()}</b> silver
      </div>
    </div>
  </div>

  <!-- ---- the three counters ---- -->
  <div class="tabs" role="tablist" aria-label="Trader sections">
    <button class="tab" class:on={tab === "sell"} role="tab" aria-selected={tab === "sell"} onclick={() => setTab("sell")}>
      Emojis
    </button>
    <button class="tab" class:on={tab === "spins"} role="tab" aria-selected={tab === "spins"} onclick={() => setTab("spins")}>
      The Wheelwright
    </button>
    <button class="tab" class:on={tab === "emporium"} role="tab" aria-selected={tab === "emporium"} onclick={() => setTab("emporium")}>
      The Emporium
    </button>
    <button class="tab vip" class:on={tab === "vip"} class:member={myVipRank() > 0} role="tab" aria-selected={tab === "vip"} onclick={() => setTab("vip")}>
      {myVipRank() > 0 ? "✦" : "🔒"} The VIP Room
    </button>
  </div>

  {#if msg}<div class="note ok">{msg}</div>{/if}
  {#if err}<div class="note err">{err}</div>{/if}

  {#if tab === "sell"}
    <div class="modes" role="tablist" aria-label="Buy or sell">
      <button class="mode" class:on={mode === "sell"} role="tab" aria-selected={mode === "sell"} onclick={() => setMode("sell")}>Sell</button>
      <span class="mode-bar" aria-hidden="true"></span>
      <button class="mode" class:on={mode === "buy"} role="tab" aria-selected={mode === "buy"} onclick={() => setMode("buy")}>Buy</button>
    </div>

    {#if mode === "buy"}
      <section class="panel">
        <p class="fineprint top">A fresh spread every day at midnight UTC, the same for everyone — one of each per customer. Restocks in <b>{shelfRestockIn}</b>. The silver you pay him burns.</p>
        {#if !stockLoaded}
          <p class="muted">Sterling is dusting the shelves…</p>
        {:else}
          {#each shelves as s (s.tier)}
            <div class="tier-row shelf" style="--tier:{TIER_COLOR[s.tier]}">
              <div class="tier-head">{SHELF_NAME[s.tier] ?? s.tier} · {s.tier} · <Coin size={11} /> {s.price.toLocaleString()} each</div>
              <div class="grid">
                {#each s.items as e (e.code)}
                  {@const taken = ownedSet.has(e.code) || e.bought}
                  <button
                    class="tile"
                    class:sel={bsel.has(e.code)}
                    class:owned={taken}
                    title={e.bought ? `${e.name} — bought today` : ownedSet.has(e.code) ? `${e.name} — you own this` : `${e.name} — ${e.price.toLocaleString()} silver`}
                    onclick={() => btoggle(e.code)}
                    disabled={taken}
                  >
                    <img src={`/emoji/${e.file}`} alt={e.name} loading="lazy" />
                    <span class="val"><Coin size={11} />{e.price.toLocaleString()}</span>
                    {#if e.bought}<span class="took">yours</span>{/if}
                  </button>
                {/each}
              </div>
              <div class="plank" aria-hidden="true"></div>
            </div>
          {/each}
        {/if}
      </section>
      {#if stock.length > 0}
        <div class="bar">
          <span class="tally">
            {#if bsel.size === 0}
              Select emoji to buy.
            {:else}
              {bsel.size} selected · <Coin size={13} /> <b>{bselTotal}</b> silver
            {/if}
          </span>
          <button class="go" disabled={bsel.size === 0 || shelfBuying || bselTotal > wallet.coins} onclick={buyShelf}>
            {shelfBuying ? "Buying…" : bselTotal > wallet.coins && bsel.size ? "Not enough silver" : "Buy"}
          </button>
        </div>
      {/if}
    {:else}
    <section class="panel">
      {#if sellable.length === 0}
        <p class="muted">
          You've nothing the Trader will buy. Win emoji on the <b>Wheel of Fortune</b>, then bring
          them here.
        </p>
      {:else}
        {#each sellGroups as g (g.tier)}
          <div class="tier-row" style="--tier:{TIER_COLOR[g.tier]}">
            <div class="tier-head">{g.tier} · {g.items.length} · <Coin size={11} /> {sellValue(g.tier)} each</div>
            <div class="grid">
              {#each g.items as e (e.code)}
                <button
                  class="tile"
                  class:sel={sel.has(e.code)}
                  title={`${e.name} — ${sellValue(e.tier)} silver`}
                  onclick={() => toggle(e.code)}
                >
                  <img src={`/emoji/${e.file}`} alt={e.name} loading="lazy" />
                  <span class="val"><Coin size={11} />{sellValue(e.tier)}</span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      {/if}

      {#if hasUnsellable}
        <p class="fineprint">
          Talismans, mythics and specials aren't bought here — trade those with other players.
        </p>
      {/if}
    </section>
    {/if}

    {#if mode === "sell" && sellable.length > 0}
      <div class="bar">
        {#if confirming}
          <span class="confirm">Sell {sel.size} for <b>{selTotal}</b> silver? This is permanent.</span>
          <button class="ghost" onclick={clearSel} disabled={selling}>Cancel</button>
          <button class="go danger" onclick={doSell} disabled={selling}>
            {selling ? "Selling…" : "Confirm sale"}
          </button>
        {:else}
          <span class="tally">
            {#if sel.size === 0}
              Select emoji to sell.
            {:else}
              {sel.size} selected · <Coin size={13} /> <b>{selTotal}</b> silver
            {/if}
          </span>
          <button class="go" disabled={sel.size === 0} onclick={doSell}>Sell</button>
        {/if}
      </div>
    {/if}
  {:else if tab === "spins"}
    <section class="panel buy">
      <div class="buy-card">
        <div class="buy-ico">🎡</div>
        <div class="buy-body">
          <div class="buy-name">Wheel of Fortune spin</div>
          <div class="buy-price"><Coin size={15} /> {wallet.spinPrice} silver each</div>
          <div class="buy-have">You have <b>{wheel.spins.total}</b> spin{wheel.spins.total === 1 ? "" : "s"} available.</div>
        </div>
      </div>

      <div class="qty">
        <button onclick={() => setQty(qty - 1)} disabled={qty <= 1} aria-label="fewer">−</button>
        <input
          type="number"
          min="1"
          max={MAX_BUY}
          value={qty}
          oninput={(e) => setQty(+e.currentTarget.value)}
        />
        <button onclick={() => setQty(qty + 1)} disabled={qty >= MAX_BUY} aria-label="more">＋</button>
        <div class="presets">
          <button onclick={() => setQty(1)}>1</button>
          <button onclick={() => setQty(5)}>5</button>
          <button onclick={() => setQty(10)}>10</button>
        </div>
      </div>

      <div class="bar inline">
        <span class="tally">Total <Coin size={13} /> <b>{cost}</b> silver</span>
        <button class="go" disabled={!canAfford || buying} onclick={doBuy}>
          {buying ? "Buying…" : `Buy ${qty} spin${qty > 1 ? "s" : ""}`}
        </button>
      </div>
      {#if !canAfford}
        <p class="fineprint">You need {cost - wallet.coins} more silver — sell some emoji first.</p>
      {/if}

      <!-- Pandora's box retired the reaper: both talisman counters close. -->
      {#if wallet.reaperRetired}
      <div class="buy-card talis">
        <div class="buy-ico">🪵</div>
        <div class="buy-body">
          <div class="buy-name">The Talisman</div>
          <div class="buy-have">The reaper is retired. The talisman is a keepsake now, and the house no longer sells it.</div>
        </div>
      </div>
      {:else}
      <!-- ---- the shield, for silver: the counter you reach when red ---- -->
      <div class="buy-card talis" class:offered={!!wallet.shieldOffer && !shielded}>
        <div class="buy-ico">🪵</div>
        <div class="buy-body">
          <div class="buy-name">
            The Talisman
            {#if wallet.shieldOffer && !shielded}
              <span class="offertag">
                {wallet.shieldOffer.kind === "courtesy"
                  ? `Sterling's courtesy — ${wallet.shieldOffer.pct}% off`
                  : `Shield sale — ${wallet.shieldOffer.pct}% off`}
              </span>
            {/if}
          </div>
          <div class="buy-price">
            {#if wallet.shieldOffer && !shielded}
              <s>{wallet.talismanBasePrice.toLocaleString()}</s>
            {/if}
            <b>{wallet.talismanPrice.toLocaleString()}</b> silver, burned
          </div>
          <div class="buy-have">
            {#if shielded}
              You already carry a talisman — one shield per soul.
            {:else}
              Land on the reaper wearing it and the amulet burns instead of you.
            {/if}
          </div>
        </div>
        {#if !shielded}
          <button
            class="go"
            onclick={doTalismanSilver}
            disabled={buyingShield || wallet.coins < wallet.talismanPrice}
          >
            {buyingShield ? "Buying…" : wallet.coins < wallet.talismanPrice ? "Not enough" : "Buy the shield"}
          </button>
        {/if}
      </div>

      <!-- ---- the talisman trade: one mythic buys the death shield ---- -->
      <div class="buy-card talis">
        <div class="buy-ico">🪬</div>
        <div class="buy-body">
          <div class="buy-name">Talisman, for a mythic</div>
          <div class="buy-price">One <b>mythic</b> emoji, surrendered to the house</div>
          <div class="buy-have">
            {#if shielded}
              You already carry a talisman — one shield per soul.
            {:else if myMythics.length === 0}
              Bring the house a mythic and it will carve you a shield.
            {:else}
              Choose which mythic the house takes. It is destroyed, not kept.
            {/if}
          </div>
        </div>
      </div>
      {#if !shielded && myMythics.length > 0}
        <div class="grid">
          {#each myMythics as m (m.code)}
            <button
              class="tile"
              class:sel={sacrificing === m.code}
              title={`Sacrifice ${m.name}`}
              onclick={() => (sacrificing = sacrificing === m.code ? null : m.code)}
            >
              <img src={`/emoji/${m.file}`} alt={m.name} />
            </button>
          {/each}
        </div>
        {#if sacrificing}
          <div class="bar inline">
            <span class="confirm">
              The house burns your <b>{myMythics.find((m) => m.code === sacrificing)?.name}</b> forever. You gain its talisman.
            </span>
            <button class="ghost" onclick={() => (sacrificing = null)} disabled={trading}>Keep it</button>
            <button class="go danger" onclick={doTalismanTrade} disabled={trading}>
              {trading ? "Trading…" : "Make the trade"}
            </button>
          </div>
        {/if}
      {/if}
      {/if}
    </section>
  {:else if tab === "vip"}
    <VipRoom {say} />
  {:else}
    <section class="panel emporium">
      {#if emporium.error}<div class="note err">{emporium.error}</div>{/if}

      <!-- (Custom sounds + banner moved to Settings → Profile — personal
           kit, not shop stock.) -->
      {#if emporium.loading}
        <p class="muted">Sterling is dusting the shelves…</p>
      {:else}
        <!-- The rotating shelf: fresh stock daily at UTC midnight. -->
        <div class="restock-line">
          <span>🕰️ Today's shelf — restocks in <b>{restockIn}</b></span>
          <span class="restock-sub">Themes never rotate · owned items never leave you</span>
        </div>
        <!-- Department chips: jump straight to the shelf you came for. -->
        <div class="ecats" role="tablist" aria-label="Emporium departments">
          <button class="ecat" class:on={ecat === "all"} onclick={() => (ecat = "all")}>Everything</button>
          {#each KIND_ORDER as k (k)}
            <button class="ecat" class:on={ecat === k} onclick={() => (ecat = ecat === k ? "all" : k)}>
              {KIND_ICONS[k]} {KIND_LABELS[k]}
            </button>
          {/each}
        </div>
        {#each itemGroups as g (g.kind)}
          <div class="egroup">
            <div class="eghead">{g.label} <span class="ecount">{g.items.length}</span></div>
            <div class="egrid">
              {#each g.items as i (i.id)}
                <div class="eitem" class:owned={i.owned} class:offshelf={!i.inStock && !i.owned}>
                  {#if i.deal && !i.owned}
                    <span class="ebadge deal">-{emporium.dealPct}% TODAY</span>
                  {:else if i.fresh && !i.owned && i.inStock}
                    <span class="ebadge fresh">NEW ON THE SHELF</span>
                  {:else if !i.inStock && !i.owned}
                    <span class="ebadge off">NOT STOCKED TODAY</span>
                  {/if}
                  <div class="epreview">
                    {#if i.kind === "theme"}
                      <span class="theme-dot" data-theme={i.id.replace("theme-", "")}>
                        <span class="td-bg"><span class="td-accent"></span></span>
                      </span>
                    {:else if i.kind === "border"}
                      <span class="ava-demo {i.id}">S</span>
                    {:else if i.kind === "flair"}
                      <span class="flair-demo {i.id}">{session.user?.displayName ?? "Name"}</span>
                    {:else if i.kind === "tombstone"}
                      <span class="tomb-demo {i.id}">✝</span>
                    {:else if i.kind === "banner"}
                      <span class="banner-demo {i.id}"></span>
                    {:else if i.kind === "cardback"}
                      <span class="cardback-demo {i.id}"></span>
                    {:else if i.kind === "dice"}
                      <span class="dice-demo {i.id}">⚄⚂</span>
                    {:else if i.kind === "epitaph"}
                      <span class="epitaph-demo {i.id}">R.I.P.</span>
                    {:else}
                      <span class="title-demo">{i.name}</span>
                    {/if}
                  </div>
                  <div class="ebody">
                    <span class="ename">{i.name}</span>
                    <span class="eblurb">{i.blurb}</span>
                  </div>
                  <div class="eact">
                    {#if !i.owned}
                      {#if i.kind === "theme"}
                        <button class="go ghosty" onclick={() => tryTheme(i)}>Try it</button>
                      {/if}
                      <button
                        class="go"
                        disabled={emporium.busy || wallet.coins < i.price || (!i.inStock && !session.user?.isAdmin)}
                        onclick={() => onItemAction(i)}
                      >
                        {#if i.deal}<s class="was">{i.basePrice.toLocaleString()}</s>{/if}
                        <Coin size={12} /> {i.price.toLocaleString()}
                      </button>
                    {:else if i.kind === "theme"}
                      <button
                        class="go ghosty"
                        class:eq={prefs.theme === i.id.replace("theme-", "")}
                        onclick={() => wearTheme(i)}
                      >
                        {prefs.theme === i.id.replace("theme-", "") ? "Wearing ✓" : "Wear it"}
                      </button>
                    {:else}
                      <button class="go ghosty" class:eq={isEquipped(i)} disabled={emporium.busy} onclick={() => onItemAction(i)}>
                        {isEquipped(i) ? "Equipped ✓" : "Equip"}
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
        <p class="fineprint">
          All sales final. Silver goes to the mint's furnace — Sterling only keeps the receipts.
        </p>
      {/if}
    </section>
  {/if}
</div>

<style>
  /* ---- Sterling's workshop: warm wood room, hanging lamps, shelves of
     curios behind him, counter along the bottom. ---- */
  .workshop {
    position: relative;
    max-width: 720px;
    margin: 0 auto 14px;
    display: flex;
    align-items: flex-end;
    gap: 16px;
    padding: 18px 20px 0;
    border-radius: 18px;
    overflow: hidden;
    background:
      radial-gradient(220px 130px at 22% 6%, rgba(255, 214, 130, 0.2), transparent 70%),
      radial-gradient(220px 130px at 78% 4%, rgba(255, 214, 130, 0.16), transparent 70%),
      repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.12) 0 3px, transparent 3px 34px),
      linear-gradient(180deg, #3a2a17 0%, #2c1f10 55%, #1d1407 100%);
    border: 1px solid rgba(150, 106, 33, 0.5);
    box-shadow: inset 0 -14px 30px rgba(0, 0, 0, 0.45);
  }
  .shelfscene {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .lamps {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .lamp {
    position: absolute;
    top: 0;
    width: 12px;
    height: 26px;
    background: linear-gradient(#2a1d0d 55%, #ffd98f 58%);
    border-radius: 0 0 8px 8px;
    box-shadow: 0 12px 18px rgba(255, 214, 130, 0.35);
  }
  .lamp.l1 { left: 20%; }
  .lamp.l2 { left: 76%; height: 20px; }
  .sterling3 {
    position: relative;
    width: 172px;
    flex: none;
    filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.55));
  }
  .sterling3 .robo {
    transform-origin: 85px 165px;
    animation: robosway 6.4s ease-in-out infinite;
  }
  @keyframes robosway {
    0%, 100% { transform: rotate(-0.6deg); }
    50% { transform: rotate(0.6deg); }
  }
  .sterling3 .lens {
    animation: lensflicker 5.4s steps(1, end) infinite;
  }
  @keyframes lensflicker {
    0%, 90%, 100% { opacity: 1; }
    92%, 94% { opacity: 0.35; }
  }
  .sterling3 .bobble {
    animation: bobble 3.2s ease-in-out infinite;
  }
  @keyframes bobble {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }
  .sterling3 .gear {
    transform-origin: 85px 136px;
    animation: gearspin 14s linear infinite;
  }
  @keyframes gearspin {
    to { transform: rotate(360deg); }
  }
  .sterling3 .mouth {
    opacity: 0.5;
  }
  .sterling3.talking .mouth {
    animation: mouthglow 0.16s steps(2, end) infinite;
  }
  @keyframes mouthglow {
    0%, 100% { opacity: 0.45; }
    50% { opacity: 1; }
  }
  .bubble2 {
    position: relative;
    flex: 1;
    min-width: 0;
    padding: 14px 18px;
    margin-bottom: 26px;
    background: rgba(20, 14, 8, 0.85);
    border: 1px solid rgba(255, 217, 143, 0.4);
    border-radius: 16px 16px 16px 4px;
    backdrop-filter: blur(2px);
  }
  .bubble2 .keeper {
    display: block;
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.26em;
    color: #ffd98f;
    margin-bottom: 4px;
  }
  .bubble2 p {
    margin: 0;
    font-family: Georgia, serif;
    font-style: italic;
    font-size: 1rem;
    color: #f3e9d5;
    min-height: 2.6em;
  }
  .bubble2 .bal-line {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 217, 143, 0.2);
    font-size: 0.78rem;
    color: rgba(243, 233, 213, 0.65);
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .bubble2 .bal-line b {
    color: #ffd98f;
  }
  /* Phones: the fixed-width robot squeezes the dialogue into a one-word-per-
     line sliver — stack the scene instead (Sterling above, bubble full-width). */
  @media (max-width: 700px) {
    .workshop {
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .sterling3 {
      width: 128px;
    }
    .bubble2 {
      flex: none;
      width: 100%;
      box-sizing: border-box;
      margin-bottom: 14px;
      border-radius: 16px;
    }
  }

  /* ---- tabs ---- */
  .tabs {
    max-width: 720px;
    margin: 0 auto 12px;
    display: flex;
    gap: 6px;
    padding: 5px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .tab {
    flex: 1;
    padding: 9px 10px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .tab:hover:not(.on) {
    color: var(--ink);
    background: var(--panel-2);
  }
  .tab.on {
    background: var(--accent);
    color: var(--accent-ink);
  }
  /* The rope's tab: brass lettering, gold once you're a member. */
  .tab.vip { color: #b8862c; }
  .tab.vip.member { color: #f2d27a; text-shadow: 0 0 8px rgba(242, 210, 122, 0.45); }
  .tab.vip.on { background: linear-gradient(180deg, #f2d27a, #b8862c); color: #2a1608; text-shadow: none; }

  /* THE COUNTER TABS WRAP ON A PHONE. Four uppercase labels in a no-wrap flex
     row cannot shrink below their content, so "THE VIP ROOM" ran past the
     right edge at 390px and read as "T… RO". Two rows of two shows all four
     whole — better than a scrolling strip here, where a tab people never
     scroll to is a counter they never find.
     THIS BLOCK MUST STAY BELOW `.tab { flex: 1 }`: same specificity, so the
     later rule wins, and when it sat above, flex-basis computed back to 0%
     and all four stayed on one squeezed row. */
  @media (max-width: 700px) {
    .tabs {
      flex-wrap: wrap;
    }
    .tab {
      flex: 1 1 calc(50% - 10px);
      min-width: 0;
      min-height: 44px; /* the touch floor */
      font-size: 0.76rem;
      letter-spacing: 0.02em;
    }
    /* Sell | Buy measured 30px tall — under the floor, on the control that
       decides which half of the Trader you are looking at. */
    .mode {
      min-height: 44px;
    }

  }

  .emporium {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .egroup {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .restock-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 8px 12px;
    margin-bottom: 6px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 8%, var(--panel-2));
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line));
    font-size: 0.82rem;
    color: var(--ink);
  }
  .restock-sub {
    font-size: 0.7rem;
    color: var(--ink-dim);
  }
  .ebadge {
    position: absolute;
    top: -8px;
    right: 10px;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .ebadge.deal {
    background: var(--danger);
    color: #fff;
  }
  .ebadge.fresh {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .ebadge.off {
    background: var(--panel-2);
    border: 1px solid var(--line);
    color: var(--ink-dim);
  }
  .eitem.offshelf {
    opacity: 0.55;
  }
  .was {
    color: color-mix(in srgb, currentColor 55%, transparent);
    font-size: 0.72rem;
    margin-right: 3px;
  }
  .ecats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 4px;
  }
  .ecat {
    padding: 6px 13px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--panel-2);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
  }
  .ecat:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .ecat.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  .eghead {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .ecount {
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    letter-spacing: 0;
    font-size: 0.64rem;
  }
  /* The Emporium gets a wider panel than the rest of the shop — the item
     cards carry a preview + blurb + two buttons and were crushing the text
     into one-word-per-line columns at 720px. */
  .panel.emporium {
    max-width: 1040px;
  }

  .egrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(400px, 100%), 1fr));
    gap: 10px;
  }
  .eitem {
    position: relative; /* anchors the deal/fresh/off-shelf badges */
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .eitem.owned {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  }
  .epreview {
    flex: none;
    width: 64px;
    display: grid;
    place-items: center;
  }
  .theme-dot .td-bg {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--bg);
    border: 2px solid var(--line-2);
  }
  .theme-dot .td-accent {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
  }
  .ava-demo {
    display: inline-grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #6b5a34;
    color: #f4ede4;
    font-weight: 700;
  }
  .flair-demo {
    font-weight: 800;
    font-size: 0.88rem;
    max-width: 56px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tomb-demo {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 44px;
    border-radius: 17px 17px 4px 4px;
    background: linear-gradient(165deg, #46404f, #232030);
    color: #b6aec4;
    font-size: 1rem;
  }
  .tomb-demo.tomb-marble {
    background: linear-gradient(165deg, #d8d4cf, #948e88);
    color: #4c4650;
  }
  .tomb-demo.tomb-obsidian {
    background: linear-gradient(165deg, #17151d, #060509);
    color: #d99a92;
    box-shadow: 0 0 8px rgba(190, 40, 40, 0.4);
  }
  .tomb-demo.tomb-mausoleum {
    clip-path: polygon(0 26%, 50% 0, 100% 26%, 100% 100%, 0 100%);
    border-radius: 0;
    background: linear-gradient(165deg, #57506b, #29253a);
    color: #cfc4d8;
  }
  .tomb-demo.tomb-cracked {
    transform: rotate(4deg);
    background:
      linear-gradient(115deg, transparent 46%, rgba(8, 6, 12, 0.9) 48%, transparent 50%),
      linear-gradient(165deg, #3f3a46, #1e1b26);
    color: #a49cae;
  }
  .tomb-demo.tomb-gilded {
    background:
      repeating-linear-gradient(64deg, rgba(234, 179, 72, 0.3) 0 1.5px, transparent 1.5px 12px),
      linear-gradient(165deg, #211d26, #0b0910);
    color: #e8c87a;
    box-shadow: inset 0 0 0 1.5px rgba(234, 179, 72, 0.45);
  }
  .tomb-demo.tomb-iron {
    border-radius: 8px 8px 3px 3px;
    background: linear-gradient(165deg, #3a3d44, #16181c);
    color: #aeb4c0;
    box-shadow: inset 0 0 0 2px rgba(120, 126, 138, 0.45);
  }
  .tomb-demo.tomb-moss {
    background:
      radial-gradient(70% 35% at 30% 8%, rgba(90, 140, 70, 0.7), transparent 70%),
      linear-gradient(165deg, #4c5248, #21251e);
    color: #b9c8a8;
  }
  .tomb-demo.tomb-crystal {
    border-radius: 42% 46% 4px 4px / 34% 38% 4px 4px;
    background: linear-gradient(165deg, #7a4bb0, #2c1548);
    color: #e6d4ff;
    box-shadow: 0 0 10px 1px rgba(150, 90, 220, 0.45);
  }
  .tomb-demo.tomb-rune {
    background:
      radial-gradient(2px 6px at 35% 30%, rgba(160, 200, 220, 0.6), transparent 70%),
      radial-gradient(2px 6px at 62% 32%, rgba(160, 200, 220, 0.55), transparent 70%),
      linear-gradient(165deg, #6d7268, #33362f);
    color: #c2d4cd;
  }
  .tomb-demo.tomb-neon {
    border-radius: 6px 6px 3px 3px;
    background: linear-gradient(165deg, #262030, #0c0a14);
    color: #ff9ed4;
    box-shadow:
      inset 0 0 0 1px rgba(255, 100, 190, 0.7),
      0 0 8px 1px rgba(255, 100, 190, 0.4);
  }
  .tomb-demo.tomb-monolith {
    width: 22px;
    height: 48px;
    border-radius: 1px;
    background: linear-gradient(172deg, #0e0e12, #020203);
    color: #6f6f7c;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }
  .banner-demo {
    display: block;
    width: 56px;
    height: 34px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: var(--panel-2);
  }
  .cardback-demo {
    display: block;
    width: 30px;
    height: 42px;
    border-radius: 5px;
    border: 1.5px solid var(--line);
  }
  .dice-demo {
    font-size: 1.7rem;
    line-height: 1;
  }
  .epitaph-demo {
    font-size: 0.95rem;
    color: var(--ink);
  }
  .title-demo {
    font-size: 0.62rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 3px 8px;
    border-radius: 12px;
    background: var(--panel-2);
    border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line));
    color: var(--ink);
    text-align: center;
    /* Stay inside the preview column — long titles wrap instead of running
       over the item's name/description (the overlap Josh reported). */
    max-width: 100%;
    box-sizing: border-box;
    overflow-wrap: anywhere;
    line-height: 1.3;
  }
  .ebody {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ename {
    font-weight: 700;
    font-size: 0.92rem;
    color: var(--ink);
  }
  .eblurb {
    font-size: 0.74rem;
    line-height: 1.35;
    color: var(--ink-soft);
  }
  .eact {
    flex: none;
  }
  .eact .go {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  /* THE EMPORIUM LISTINGS ON A PHONE — and this block MUST stay below the
     `.ebody { flex: 1 }` / `.eact { flex: none }` above it. Same specificity,
     so source order decides, and putting it with the other phone rules 350
     lines up is exactly why the first attempt did nothing: `.eitem`'s wrap
     applied (nothing overrides it later) while the two flex values were
     quietly beaten by their own base rules. This is the second time that
     trap has been sprung in this file; the first is commented up there too.

     What it fixes: swatch + text + button in one 303px row left the
     description about 110px, so "Glossy aqua and dewdrop green — the
     optimistic internet" came out as four ragged lines under a name that
     wrapped as well. The button drops to its own row at full width, which
     hands the words the rest of the card and makes the action a proper
     target instead of a squeezed pill. */
  @media (max-width: 700px) {
    .eitem {
      flex-wrap: wrap;
      gap: 10px 12px;
      padding: 12px;
    }
    .ebody {
      flex: 1 1 150px;
    }
    .eact {
      flex: 1 1 100%;
    }
    .eact .go {
      width: 100%;
      justify-content: center;
      min-height: 44px;
    }
  }
  .go.ghosty {
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line-2);
  }
  .go.ghosty.eq {
    border-color: var(--accent);
    color: var(--accent);
  }

  .shop {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    padding: clamp(18px, 4vh, 40px) 22px 48px;
  }
  .note {
    max-width: 720px;
    margin: 0 auto 12px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.86rem;
  }
  .note.ok {
    background: color-mix(in srgb, var(--ok) 16%, transparent);
    border: 1px solid var(--ok);
    color: var(--ink);
  }
  .note.err {
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    border: 1px solid var(--danger);
    color: var(--ink);
  }
  .panel {
    max-width: 720px;
    margin: 0 auto;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 16px;
  }
  .muted {
    color: var(--ink-dim);
    line-height: 1.5;
    margin: 6px 0;
  }
  .grid {
    display: grid;
    /* 66, not 58: the price sits UNDER the art now and the widest tag the
       shelf can print is "25,000" — at 58 it wrapped or clipped. */
    grid-template-columns: repeat(auto-fill, minmax(66px, 1fr));
    gap: 8px;
  }
  .tile {
    position: relative;
    aspect-ratio: 1;
    display: grid;
    /* THE PRICE GETS ITS OWN ROW (Josh, Sep 2026: "they get cut off or
       blocked by the emjois"). It used to be absolutely positioned in the
       bottom-right corner ON TOP of the artwork, so a bright or
       full-bleed emoji swallowed it and a four-figure price ran past the
       tile's edge. Art in the 1fr row, price in the auto row, and they can
       never reach each other. */
    grid-template-rows: 1fr auto;
    place-items: center;
    padding: 6px;
    background: var(--panel-2);
    border: 2px solid var(--line);
    border-radius: 10px;
    cursor: pointer;
  }
  .tile img {
    width: 100%;
    height: 100%;
    min-height: 0; /* let the art shrink inside its row instead of pushing out */
    object-fit: contain;
  }
  .tile.sel {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--panel-2));
  }
  .val {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    max-width: 100%;
    margin-top: 3px;
    color: var(--ink-soft);
    font-size: 0.62rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    white-space: nowrap;
  }
  .fineprint {
    margin: 12px 2px 0;
    color: var(--ink-dim);
    font-size: 0.78rem;
  }
  .fineprint.top { margin: 0 2px 12px; }
  /* Buy / Sell selector under the Emojis counter. */
  .modes {
    display: flex;
    align-items: center;
    width: max-content;
    gap: 4px;
    padding: 4px;
    margin: 0 auto 14px;
    border-radius: 10px;
    background: var(--panel-2);
    border: 1px solid var(--line);
  }
  /* The shelves: a wooden plank under each row of tiles. */
  .shelf { padding-bottom: 6px; }
  .plank {
    height: 9px;
    margin: 8px -4px 0;
    border-radius: 3px;
    background: linear-gradient(180deg, #9a6a35, #6a4520 60%, #4a2f14);
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 220, 170, 0.25);
  }
  .tile .took {
    position: absolute;
    top: 4px;
    left: 4px;
    padding: 1px 5px;
    border-radius: 6px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 0.6rem;
    font-weight: 800;
    text-transform: uppercase;
  }
  .mode-bar {
    width: 1px;
    height: 18px;
    background: var(--line-2);
  }
  .mode {
    min-width: 84px;
    padding: 6px 18px;
    border-radius: 7px;
    border: none;
    background: transparent;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.86rem;
    font-weight: 700;
    cursor: pointer;
  }
  .mode.on {
    background: var(--accent);
    color: #1a1208;
  }
  /* AN INVENTORY, BY RARITY (Josh, Sep 2026): each tier in its own row with
     a slight glow of its colour — the same shape the Profile's collection
     wears. Kept faint on purpose ("not too much"). */
  .tier-row {
    margin-bottom: 14px;
    padding: 10px 12px 12px;
    border-radius: 12px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--tier) 10%, transparent), transparent 85%);
    border: 1px solid color-mix(in srgb, var(--tier) 24%, var(--line));
    box-shadow: inset 0 0 24px color-mix(in srgb, var(--tier) 6%, transparent);
  }
  .tier-row:last-child { margin-bottom: 0; }
  .tier-head {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--tier);
  }
  .tile.owned {
    opacity: 0.35;
    cursor: default;
    filter: grayscale(0.6);
  }

  /* THE SHELF, SIZED BY THE SCREEN RATHER THAN BY A CONSTANT (Josh, Sep 2026:
     "polish the formatting and fix the auto scaling to where things fit nice
     on any size mobile screen … the text for each listing and the sizing of
     images and buttons").

     BELOW `.grid` / `.tile` / `.val`, not up with the other phone rules —
     same specificity, so source order decides. Putting it up there is what
     made the first attempt do nothing but widen the columns: `.grid`'s
     override lost to its own base rule 400 lines down, and so did the tile
     and the price. Third time in this file; see the two comments above.

     What it fixes: `minmax(66px, 1fr)` with a 0.62rem price is a 9.9px
     number under a 57px picture, identical on a 320px Android and a 430px
     Pro Max — the same box with more or less air around it. Each part is a
     clamp against the viewport now, so the tile, its art and its price all
     grow with the screen. `auto-fill` still decides the column COUNT, so a
     wide window gets more tiles rather than three enormous ones. */
  @media (max-width: 700px) {
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(clamp(96px, 15vw, 132px), 1fr));
      gap: clamp(8px, 2.4vw, 12px);
    }
    .tile {
      /* Slightly taller than square. The price has a ROW of its own, so on a
         1:1 tile it eats a fifth of the height and the art is letterboxed
         into what is left; this gives the number its room without taking the
         art's. Height follows width, so the whole tile scales with the phone
         rather than jumping when the column count changes. */
      aspect-ratio: 1 / 1.17;
      padding: clamp(7px, 2vw, 10px);
    }
    .val {
      margin-top: 4px;
      font-size: clamp(0.72rem, 3vw, 0.84rem);
    }
  }
  /* A PHONE GETS A FIXED THREE COLUMNS. `auto-fill` changes the column COUNT
     as the screen grows, which is right for a window that can be any width
     and wrong for a phone: it means a 360px and a 390px handset show the
     same 87px tile with different gutters, and somewhere in between the
     count drops and everything lurches. Pinning the count makes the tile a
     share of the screen — 70px at 320, 87px at 390, 100px at 430 — so the
     shelf looks deliberate on every handset. Above this width auto-fill
     takes over again and a tablet gets more tiles instead of giant ones. */
  @media (max-width: 480px) {
    .grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .bar {
    max-width: 720px;
    margin: 14px auto 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .bar.inline {
    margin-top: 14px;
  }
  .tally,
  .confirm {
    flex: 1;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .tally b,
  .confirm b {
    color: var(--ink);
  }
  .go {
    padding: 8px 20px;
    border-radius: 9px;
    border: none;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .go:hover:not(:disabled) {
    filter: brightness(1.06);
  }
  .go.danger {
    background: var(--danger);
    color: #fff;
  }
  .go:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ghost {
    padding: 8px 14px;
    border-radius: 9px;
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-soft);
    font: inherit;
    cursor: pointer;
  }
  .ghost:hover:not(:disabled) {
    color: var(--ink);
  }

  /* buy tab */
  .buy-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 6px 4px 16px;
    border-bottom: 1px solid var(--line);
  }
  .buy-card.talis {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
    border-bottom: none;
  }
  .buy-ico {
    font-size: 2.4rem;
    line-height: 1;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
  }
  .buy-name {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--ink);
  }
  /* A live shield offer: Sterling's personal courtesy, or the floor's sale. */
  .buy-card.talis.offered {
    border-top-color: var(--ok);
  }
  .offertag {
    margin-left: 8px;
    padding: 2px 8px;
    border: 1px solid var(--ok);
    border-radius: 999px;
    color: var(--ok);
    font-size: 0.72rem;
    font-weight: 700;
    vertical-align: middle;
    white-space: nowrap;
  }
  .buy-price s {
    opacity: 0.6;
  }
  .buy-price {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 3px;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .buy-have {
    margin-top: 5px;
    color: var(--ink-dim);
    font-size: 0.82rem;
  }
  .buy-have b {
    color: var(--ink-soft);
  }
  .qty {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
  }
  .qty > button {
    width: 38px;
    height: 38px;
    border-radius: 9px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink);
    font-size: 1.1rem;
    cursor: pointer;
  }
  .qty > button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .qty input {
    width: 72px;
    height: 38px;
    text-align: center;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 9px;
    color: var(--ink);
    font: inherit;
    font-size: 1rem;
    font-weight: 700;
  }
  .qty input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .presets {
    display: flex;
    gap: 5px;
    margin-left: auto;
  }
  .presets button {
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-soft);
    font: inherit;
    cursor: pointer;
  }
  .presets button:hover {
    color: var(--ink);
    border-color: var(--ink-dim);
  }
</style>
