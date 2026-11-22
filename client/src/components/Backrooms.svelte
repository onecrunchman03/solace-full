<script lang="ts">
  import { brTest } from "../lib/brtest.svelte";
  import { onMount, onDestroy } from "svelte";
  import { api } from "../lib/api";
  import { brGame } from "../backrooms/active";
  import { emoji, refreshOwned } from "../lib/emoji.svelte";
  import { relicName, relicImg, relicDesc, relicAda } from "../backrooms/reliccatalog";
  import { ETCHED_RELICS } from "../../../src/portal/sources";
  import Glyph from "../portal/Glyph.svelte";
  import { suitColorLabel, SUIT_SWATCH, ISSUED_SUITS } from "../backrooms/suitcolor";
  import { suitPic, suitPicStyle } from "../lib/suitpic.svelte";
  import { sprayCss } from "../backrooms/paint";
  import { session } from "../lib/session.svelte";
  import { wallet, loadWallet } from "../lib/wallet.svelte";
  import Coin from "./Coin.svelte";
  import { vossLinePool, gatherVossCtx, RETRIEVAL_PCT, type VossVenue } from "../lib/ada-lines";
  import { takeIdle, voiceReact } from "../lib/npcvoice";
  import { pickFresh } from "../lib/linepick";
  import { drawOperator } from "../backrooms/opmap";

  // The Solace-side Backrooms section: the COMMUNITY MAIN MAP (everything
  // anyone has ever explored, fog-of-war over the frozen Sector A), live
  // door status, and THE GAME ITSELF — embedded as the primary way to play
  // (Josh's call). Choosing a door dynamically imports the game bundle
  // (Three.js and all — its own chunk, never in main) and mounts it as a
  // full-viewport overlay; leaving unmounts and returns here. The map
  // endpoint only ever sends geometry for explored cells, so this view
  // physically cannot spoil the unexplored maze.

  type MapData = Awaited<ReturnType<typeof api.backroomsMap>>;
  type StatusData = Awaited<ReturnType<typeof api.backroomsStatus>>;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let map = $state<MapData | null>(null);
  let status = $state<StatusData | null>(null);
  /** Which level the HOME tab is looking at (map + doors). 0 and 1 are real;
   *  2–9 are the reserved in-development slots. */
  let selLevel = $state<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9>(0);
  let playingLevel = $state<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9>(0);
  const level1Open = $derived(!!(status?.level1Open || map?.level1Open));
  const level2Open = $derived(!!(status?.level2Open || map?.level2Open));
  const level3Open = $derived(!!(status?.level3Open || map?.level3Open));
  const level4Open = $derived(!!(status?.level4Open || map?.level4Open));
  const level5Open = $derived(!!(status?.level5Open || map?.level5Open));
  const level6Open = $derived(!!(status?.level6Open || map?.level6Open));
  const level7Open = $derived(!!(status?.level7Open || map?.level7Open));
  const level8Open = $derived(!!(status?.level8Open || map?.level8Open));
  const level9Open = $derived(!!(status?.level9Open || map?.level9Open));
  const levelsOpen = $derived(1 + (level1Open ? 1 : 0) + (level2Open ? 1 : 0) + (level3Open ? 1 : 0) + (level4Open ? 1 : 0) + (level5Open ? 1 : 0) + (level6Open ? 1 : 0) + (level7Open ? 1 : 0) + (level8Open ? 1 : 0) + (level9Open ? 1 : 0));
  /** The operator playtests every level before its door opens (Josh, Sep
   *  2026). The server enforces it (enter refuses anyone else); this only
   *  decides whether the rail shows the level as selectable. */
  const operator = $derived(!!session.user?.isAdmin);
  const levelReachable = (l: number): boolean =>
    // the operator walks into every level, unlocked or not (law 7) — Level 1
    // included, which a deep reset relocks
    l === 0 || (l === 1 && (level1Open || operator)) || (l === 2 && (level2Open || operator)) || (l === 3 && (level3Open || operator)) || (l === 4 && (level4Open || operator)) || (l === 5 && (level5Open || operator)) || (l === 6 && (level6Open || operator)) || (l === 7 && (level7Open || operator)) || (l === 8 && (level8Open || operator)) || (l === 9 && (level9Open || operator));
  function pickLevel(l: number): void {
    if (levelReachable(l)) {
      selLevel = l as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      void refresh();
    }
  }
  /** THE SHIP GATE (CLAUDE.md): members walk into the Electrical Station only
   *  after the admin has walked it in Test play and pulls this. */
  let gateBusy = $state(false);
  async function setStationGate(open: boolean): Promise<void> {
    if (gateBusy) return;
    // the house's own dialog, never a browser confirm (the standing rule)
    const sure = await ask(
      open
        ? { title: "Open the Electrical Station to members?", body: "Only do this after walking it in Test play: breakers, cutoffs, the water, the arcs, the Bleeder, and the shutter.", confirm: "open it" }
        : { title: "Shut the Electrical Station to members?", body: "Anyone inside stays until they leave.", confirm: "shut it", danger: true },
    );
    if (!sure) return;
    gateBusy = true;
    try {
      await api.backroomsOpenStation(open);
      await refresh();
    } finally {
      gateBusy = false;
    }
  }
  /** …and the same switch for the Abandoned Office. */
  async function setOfficeGate(open: boolean): Promise<void> {
    if (gateBusy) return;
    const sure = await ask(
      open
        ? { title: "Open the Abandoned Office to members?", body: "Only do this after walking it in Test play: the keycard, the stairwell door, the lights, and the Temp.", confirm: "open it" }
        : { title: "Shut the Abandoned Office to members?", body: "Anyone inside stays until they leave.", confirm: "shut it", danger: true },
    );
    if (!sure) return;
    gateBusy = true;
    try {
      await api.backroomsOpenOffice(open);
      await refresh();
    } finally {
      gateBusy = false;
    }
  }
  /** …and for the Terror Hotel. */
  async function setHotelGate(open: boolean): Promise<void> {
    if (gateBusy) return;
    const sure = await ask(
      open
        ? { title: "Open the Terror Hotel to members?", body: "Only do this after walking it in Test play: the register, the Boiler Key, the lifts, the heat, and the moths.", confirm: "open it" }
        : { title: "Shut the Terror Hotel to members?", body: "Anyone inside stays until they leave.", confirm: "shut it", danger: true },
    );
    if (!sure) return;
    gateBusy = true;
    try {
      await api.backroomsOpenHotel(open);
      await refresh();
    } finally {
      gateBusy = false;
    }
  }
  /** …and for the Cave System. */
  async function setCaveGate(open: boolean): Promise<void> {
    if (gateBusy) return;
    const sure = await ask(
      open
        ? { title: "Open the Cave System to members?", body: "Only do this after walking it in Test play: the platform, the caverns, the Climbing Rope through the Deep, the Chimney, and the Burrower.", confirm: "open it" }
        : { title: "Shut the Cave System to members?", body: "Anyone inside stays until they leave.", confirm: "shut it", danger: true },
    );
    if (!sure) return;
    gateBusy = true;
    try {
      await api.backroomsOpenCave(open);
      await refresh();
    } finally {
      gateBusy = false;
    }
  }
  /** …and for the Suburbs. */
  async function setSuburbsGate(open: boolean): Promise<void> {
    if (gateBusy) return;
    const sure = await ask(
      open
        ? { title: "Open the Suburbs to members?", body: "Only do this after walking it in Test play: up the Chimney, the streets, the House Key in its house, the Watch in the dark, and through Number 9's front door.", confirm: "open it" }
        : { title: "Shut the Suburbs to members?", body: "Anyone inside stays until they leave.", confirm: "shut it", danger: true },
    );
    if (!sure) return;
    gateBusy = true;
    try {
      await api.backroomsOpenSuburbs(open);
      await refresh();
    } finally {
      gateBusy = false;
    }
  }
  /** …and for Thalassophobia. */
  async function setOceanGate(open: boolean): Promise<void> {
    if (gateBusy) return;
    const sure = await ask(
      open
        ? { title: "Open Thalassophobia to members?", body: "Only do this after swimming it in Test play: the roofs, the Diving Helmet, the dive to the subway stair, and the thing below.", confirm: "open it" }
        : { title: "Shut Thalassophobia to members?", body: "Anyone inside stays until they leave.", confirm: "shut it", danger: true },
    );
    if (!sure) return;
    gateBusy = true;
    try {
      await api.backroomsOpenOcean(open);
      await refresh();
    } finally {
      gateBusy = false;
    }
  }
  /** …and for Lights Out. */
  async function setLightsGate(open: boolean): Promise<void> {
    if (gateBusy) return;
    const sure = await ask(
      open
        ? { title: "Open Lights Out to members?", body: "Only do this after walking it in Test play: the dark, the Handwheel, the sea hatch, and the Listener.", confirm: "open it" }
        : { title: "Shut Lights Out to members?", body: "Anyone inside stays until they leave.", confirm: "shut it", danger: true },
    );
    if (!sure) return;
    gateBusy = true;
    try {
      await api.backroomsOpenLights(open);
      await refresh();
    } finally {
      gateBusy = false;
    }
  }
  let offline = $state(false);
  let poll = 0;
  // The installer is uploaded to the same served dir as the desktop shell;
  // the card only shows a live button once the file actually exists.
  const DOWNLOAD_URL = "/desktop/SolaceBackrooms-Setup.exe";
  let downloadReady = $state(false);

  const ROMAN = ["I", "II", "III", "IV"];

  // THE DESCENT (Josh, Sep 2026, correcting a draft that had made the seam a
  // DIAL: "each room level has the door to the next level… it was always one
  // door from the beginning").
  //
  // THE RULE, and it is the one the whole game already runs on: every level
  // holds the door down to the next. You find it, you open it, and that is
  // the ONLY way anybody reaches a new layer — exactly as Level 0's DOOR and
  // its key have worked since the Poolrooms shipped. This board is not how
  // you get somewhere new. It is fast travel back to a door somebody already
  // opened, which is the whole of what Voss's frequency work buys.
  //
  // THE INDEX IS THE LEVEL ID the API takes, and it is also the number the
  // player reads — the same numbering the roster's zone lines have used since
  // "WHERE IN THE HOUSE" ("in the Backrooms — Level 0", "in the Poolrooms —
  // Level 1"). Ten of them, which is exactly what Pandora's Rusted Key has
  // been counting since it shipped (RUSTED_LEVELS in src/pandora.ts), so this
  // list is the shape of the finished game rather than decoration.
  //
  // The eight ahead carry their real names from the Backrooms canon's "Main
  // Nine" so the road is legible before any of it is built. Level 1 is the
  // one that doesn't line up, and that is canon too: in the wider mythos the
  // Poolrooms are Level 37. Doors have never run in numerical order.
  const LEVELS: { name: string; note: string }[] = [
    { name: "THE LOBBY", note: "Wet carpet, yellow wallpaper, fluorescent hum." },
    { name: "THE POOLROOMS", note: "White tile and lukewarm water, lit from nowhere. The old survey files it as Level 37." },
    { name: "PIPE DREAMS", note: "Maintenance tunnels. The pipes are hot." },
    { name: "ELECTRICAL STATION", note: "Dark service corridors, live equipment." },
    { name: "ABANDONED OFFICE", note: "Offices. The windows look onto nothing." },
    { name: "TERROR HOTEL", note: "Ballrooms and corridors that keep going." },
    { name: "LIGHTS OUT", note: "No light of its own. Bring your own." },
    { name: "THALASSOPHOBIA", note: "Open ocean over a drowned city." },
    { name: "THE CAVE SYSTEM", note: "Rock, water, and a very long way down." },
    { name: "THE SUBURBS", note: "Streets and dark houses at night. Somebody whistles." },
  ];

  function bits(b64: string): Uint8Array {
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  const bit = (buf: Uint8Array, i: number): number => (buf[i >> 3] >> (i & 7)) & 1;

  function draw(): void {
    if (!map || !canvas) return;
    const n = map.size;
    const S = 3; // px per cell → 768px board
    canvas.width = n * S;
    canvas.height = n * S;
    const ctx = canvas.getContext("2d")!;
    // The void: everything starts unexplored-black.
    ctx.fillStyle = "#050403";
    ctx.fillRect(0, 0, n * S, n * S);

    const explored = bits(map.explored);
    const wallN = bits(map.wallN);
    const wallW = bits(map.wallW);
    const solid = bits(map.solid);

    ctx.fillStyle = "#c9b26a";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        if (!bit(explored, i)) continue;
        ctx.fillRect(x * S, y * S, S, S);
      }
    }
    ctx.fillStyle = "#4a3d1e";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        if (!bit(explored, i)) continue;
        if (bit(solid, i)) ctx.fillRect(x * S, y * S, S, S);
        if (bit(wallN, i)) ctx.fillRect(x * S, y * S, S, 1);
        if (bit(wallW, i)) ctx.fillRect(x * S, y * S, 1, S);
      }
    }
    // Doors: always known — and RED, outlined and named, like the doors in
    // the world (Josh, Sep 2026: "a clear outline entrance and exit door
    // marker in red").
    for (const d of map.doors) {
      ctx.fillStyle = "#ff4a3a";
      ctx.fillRect(d.x * S - 3, d.y * S - 3, S + 6, S + 6);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(d.x * S - 5, d.y * S - 5, S + 10, S + 10);
      ctx.font = "800 11px system-ui, sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      const tag = `${d.name ?? "the door"} — way in & out`;
      // a door on the east half names itself to its LEFT, so an edge door's
      // tag stays on the canvas
      const tw = ctx.measureText(tag).width;
      const tx = d.x > n / 2 ? d.x * S - 10 - tw : d.x * S + 10;
      const ty = Math.max(12, Math.min(n * S - 4, d.y * S + 4));
      ctx.strokeText(tag, tx, ty);
      ctx.fillStyle = "#ff6a5a";
      ctx.fillText(tag, tx, ty);
    }
    // Discovered landmarks: named.
    ctx.font = "600 11px system-ui, sans-serif";
    for (const l of map.landmarks) {
      ctx.fillStyle = "#e8a25c";
      ctx.beginPath();
      ctx.arc(l.x * S, l.y * S, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0dfae";
      ctx.fillText(l.name, l.x * S + 7, l.y * S + 4);
    }
    // NO DEATH MARKERS. Bodies are deliberately absent from this map (Josh,
    // July 2026): a corpse only shows up in game, within 50m, so recovery is a
    // feat of memory. The server doesn't send them either — don't re-add this.

    // THE OPERATOR VIEW — admins only (the server attaches `operator` for
    // nobody else): every monster, relic, drive and objective on THIS level,
    // drawn the same way on every level (backrooms/opmap.ts). Drive TEXT is
    // still never sent — only where it lies.
    if (map.operator) drawOperator(ctx, map.operator, S);

    // LIVE players (Josh: the map should show who's inside, centered on
    // them) — pulsing green dots + names, scroll centered on the group.
    const live = status?.players ?? [];
    if (live.length) {
      ctx.font = "700 11px system-ui, sans-serif";
      for (const p of live) {
        ctx.fillStyle = "#5cdc78";
        ctx.beginPath();
        ctx.arc(p.x * S, p.y * S, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(92, 220, 120, 0.5)";
        ctx.beginPath();
        ctx.arc(p.x * S, p.y * S, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#d8f5c9";
        ctx.fillText(p.name, p.x * S + 11, p.y * S + 4);
      }
      const cx = (live.reduce((a, p) => a + p.x, 0) / live.length) * S;
      const cy = (live.reduce((a, p) => a + p.y, 0) / live.length) * S;
      const scroller = canvas.parentElement;
      if (scroller) {
        scroller.scrollLeft = cx - scroller.clientWidth / 2;
        scroller.scrollTop = cy - scroller.clientHeight / 2;
      }
    }
  }

  async function refresh(): Promise<void> {
    try {
      const [m, s, meData, d] = await Promise.all([
        api.backroomsMap(selLevel),
        api.backroomsStatus(),
        api.backroomsMe(),
        api.backroomsDeaths(),
      ]);
      map = m;
      status = s;
      runLostAt = s.myRun?.waiting && s.myRun.lostInMs != null ? Date.now() + s.myRun.lostInMs : null;
      me = meData;
      deaths = d.deaths;
      offline = false;
      draw();
    } catch {
      offline = true;
    }
  }

  // ---- Voss's counter + the locker (B3 economy) ---------------------------
  type MeData = Awaited<ReturnType<typeof api.backroomsMe>>;
  let me = $state<MeData | null>(null);
  let deaths = $state<{ name: string; cause: string; at: number }[]>([]);
  let kitPicking = $state(false);
  let busy = $state(false);
  // The locker's item card (Josh: every filled slot is selectable and opens
  // its own panel — sell, upgrade, recolor).
  type LockerItem = { id: number; kind: string; level: number; color: string | null };
  let picked = $state<LockerItem | null>(null);
  /** An unlocked relic opened from the collection: its card. */
  let relicCard = $state<string | null>(null);
  // Threshold-4's suit counter: pick a color, THEN press the price to buy.
  let suitPick = $state<string | null>(null);
  let vossNote = $state("");
  let noteTimer = 0;

  const show = (t: string): void => {
    vossNote = t;
    clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => (vossNote = ""), 3200);
  };
  /** A REACTION (THE HOUSE'S BRAINS, lib/npcvoice.ts): the scripted line is
   *  the brief and she says it in her own words, or as written when there's
   *  no model. Her lines are set in quotation marks; those stay put. */
  const say = (t: string, event?: string): void => {
    if (!event) return show(t);
    const quoted = /^".*"$/s.test(t);
    const core = quoted ? t.slice(1, -1) : t;
    void voiceReact("voss", "threshold", core, event).then((out) => show(quoted ? `"${out.replace(/^"|"$/g, "")}"` : out));
  };

  // ---- HER VOICE (client/src/lib/ada-lines.ts) ----------------------------
  // The same shape as Sterling's bubble: an idle line drawn from a pool that
  // knows your file, rotating on a slow clock, with anything she says in
  // REPLY to an action overriding it until that times out. She is the cold
  // half of the house — see the header of ada-lines.ts for the register.
  let vossIdle = $state("");
  let idleTimer = 0;
  /** This account's own recorded fatalities below — read by her line pool and
   *  by the station log, so the two can never disagree. */
  const myDeaths = $derived(deaths.filter((d) => d.name === session.user?.displayName).length);
  const vossCtx = (): ReturnType<typeof gatherVossCtx> =>
    gatherVossCtx({
      relics: me?.relics.length ?? 0,
      locker: me?.items.length ?? 0,
      hasSuit: !!me?.items.some((i) => i.kind === "suit"),
      carryingRelic: !!me?.items.some((i) => i.kind === "relic"),
      carryingTape: !!me?.items.some((i) => i.kind === "tape"),
      grant: me?.grant.silver ?? 0,
      grantState: me?.grant.state ?? "funded",
      deaths: myDeaths,
      levelsOpen,
    });
  function rollVossLine(venue: VossVenue = "threshold"): void {
    // Never the line she just said — see lib/linepick.ts.
    // Written for this surveyor by the model; the scripted pool only while
    // no batch is to hand (lib/npcvoice.ts).
    const line = takeIdle("voss", venue) ?? pickFresh("voss:" + venue, vossLinePool(venue, vossCtx()));
    if (line) vossIdle = line;
  }

  // Grouped manifest (Josh: the buy list was an undifferentiated stack).
  const KIT = ["flashlight", "spraycan", "backpack"];
  const OPTICS = ["camera", "walkie"];
  const SUPPLIES = ["pills", "battery", "almondwater"];

  // ---- The house confirm dialog --------------------------------------------
  // Every irreversible action here used to raise a BROWSER confirm() — a grey
  // Chrome box in the middle of Threshold-4 (Josh: replace them all). This is
  // the promise-shaped Solace version: `if (!(await ask({...}))) return;`
  // reads exactly like the old code, so no call site had to change shape.
  let asking = $state<{
    title: string;
    body: string;
    confirm: string;
    danger: boolean;
    /** When set, the confirm button stays dead until this phrase is typed
     *  EXACTLY. For the actions where a stray click is unrecoverable — you
     *  cannot misclick your way through a keyboard. */
    typeToConfirm?: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  let typed = $state("");

  function ask(o: {
    title: string;
    body: string;
    confirm?: string;
    danger?: boolean;
    typeToConfirm?: string;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      typed = "";
      asking = {
        title: o.title,
        body: o.body,
        confirm: o.confirm ?? "confirm",
        danger: o.danger ?? false,
        typeToConfirm: o.typeToConfirm,
        resolve,
      };
    });
  }

  /** Armed only when nothing has to be typed, or what was typed matches. */
  const askArmed = $derived(!asking?.typeToConfirm || typed.trim() === asking.typeToConfirm);

  function answer(ok: boolean): void {
    if (ok && !askArmed) return; // belt and braces: the button is disabled too
    const a = asking;
    asking = null;
    typed = "";
    a?.resolve(ok);
  }

  const ownedRares = $derived(emoji.owned.filter((e) => e.tier === "rare"));
  const gearName = (kind: string): string =>
    me?.catalog.find((g) => g.kind === kind)?.name ?? (kind === "suit" ? "Hazmat Suit" : kind);

  // Her refusals, in her own voice. A raw server code ("have_suit") in the
  // dialogue box reads like a crash; these are the ones a player can actually
  // hit at the counter.
  const REFUSAL: Record<string, string> = {
    insufficient: "\"You can't afford that. I don't extend credit — there's a machine by the door for that.\"",
    locker_full: "\"Your locker is full. I don't buy equipment back, so throw something away.\"",
    have_suit: "\"You already have a suit. The standard kit is for people who don't. One each.\"",
    not_rare: "\"That isn't a rare. Read the manifest.\"",
    not_owned: "\"You don't own that.\"",
    grant_dry: "\"The acquisition account can't cover it. Hold it, or find a private buyer.\"",
    max_level: "\"That's fully calibrated. There's nothing left to tighten.\"",
    vip_suit: "\"That one was issued, not bought. The locker replaces it. Keep it.\"",
    already_upgraded: "\"Your locker is already as large as Async will authorize.\"",
  };

  async function act(fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      say(REFUSAL[code] ?? "\"That didn't go through. Try again.\"");
    } finally {
      busy = false;
    }
  }

  const doBuy = (kind: string, color?: string): Promise<void> =>
    act(async () => {
      const r = await api.backroomsBuy(kind, color);
      wallet.coins = r.coins;
      say(`"It's in your locker. Don't lose it."`, `bought a ${kind} from your manifest; it went into their locker`);
      void refresh();
    });

  const doUpgrade = (itemId: number): Promise<void> =>
    act(async () => {
      const r = await api.backroomsUpgrade(itemId);
      wallet.coins = r.coins;
      say(`"Calibrated to level ${r.level}."`, `paid you to upgrade a piece of their kit to level ${r.level}`);
      void refresh();
    });

  // Paint color is FREE now (Josh) — pick it like a preference, from the
  // locker, as many times as you like.
  const doSpray = (itemId: number, color: string): Promise<void> =>
    act(async () => {
      const r = await api.backroomsSprayColor(itemId, color);
      wallet.coins = r.coins;
      if (picked?.id === itemId) picked = { ...picked, color };
      say(`"${color}. Bold choice."`, `picked ${color} as the paint for their spray can`);
      void refresh();
    });

  const doLockerUp = (): Promise<void> =>
    act(async () => {
      const ok = await ask({
        title: "LOCKER EXPANSION",
        body: `Expand your locker to ${me?.prices.lockerMax} slots for ${fmt(me?.prices.lockerUpgrade ?? 0)} silver?`,
        confirm: `pay ${fmt(me?.prices.lockerUpgrade ?? 0)} silver`,
      });
      if (!ok) return;
      const r = await api.backroomsLockerUpgrade();
      wallet.coins = r.coins;
      if (me) me.lockerSlots = r.lockerSlots;
      say(`"More room for things you'll lose anyway."`, "paid you to enlarge their locker");
    });

  const fmt = (n: number): string => n.toLocaleString();

  /** What Async will pay for a FINDING. Equipment has no resale at
   *  Threshold-4 since the silver switch — Voss buys research, not kit. */
  const RESEARCH = new Set(["relic", "tape"]);
  const turnInPrice = (kind: string, color?: string | null): number =>
    kind === "relic"
      ? (me?.prices.relic ?? 1000)
      : kind === "tape"
        ? (me?.prices.footage?.[color ?? "far"] ?? 50)
        : 0;
  /** Async's budget is public: a counter that might refuse you should say so
   *  BEFORE you walk back out of the corridors with a relic. */
  const grantSilver = $derived(me?.grant.silver ?? 0);
  const grantState = $derived(me?.grant.state ?? "funded");
  const canAfford = (n: number): boolean => wallet.coins >= n;
  const grantCanPay = (n: number): boolean => grantSilver >= n;
  // A suit's picture is the rendered model in its colorway (lib/suitpic).
  const itemImg = (kind: string, color: string | null): string =>
    kind === "relic" ? (relicImg(color ?? "") ?? "") : kind === "suit" ? suitPic(color) : (GEAR_IMG[kind] ?? "");
  const itemLabel = (kind: string, color: string | null): string =>
    kind === "relic"
      ? `Relic · ${relicName(color ?? "")}`
      : kind === "tape"
        ? `Entity footage · ${color ?? "far"} range`
        : gearName(kind) + (color ? ` · ${color}` : "");

  const doTurnIn = (itemId: number, kind: string, color: string | null): Promise<void> =>
    act(async () => {
      const price = turnInPrice(kind, color);
      const ok = await ask({
        title: "TURN IN — THRESHOLD-4",
        body: `${itemLabel(kind, color)} against Async's research budget: ${fmt(price)} silver. The finding stays with her.`,
        confirm: `turn in for ${fmt(price)} silver`,
      });
      if (!ok) return;
      const r = await api.backroomsSellItem(itemId);
      wallet.coins = r.coins;
      if (me) me.grant = { ...me.grant, silver: r.grant };
      picked = null;
      say(`"Catalogued. ${fmt(r.gained)} silver released. Next."`, `sold you a finding from below, and you paid them ${fmt(r.gained)} silver out of the acquisition account`);
      void refresh();
    });

  /** Equipment has no buyer here. Throwing it away is free and final — the
   *  way out of a full locker now that Voss only buys findings. */
  const doDiscard = (itemId: number, kind: string, color: string | null): Promise<void> =>
    act(async () => {
      const ok = await ask({
        title: "DISCARD",
        body: `Throw away ${itemLabel(kind, color)}? Threshold-4 does not buy equipment back, so this returns nothing.`,
        confirm: "throw it away",
        danger: true,
      });
      if (!ok) return;
      await api.backroomsDiscard(itemId);
      picked = null;
      say(`"Your locker, your decision."`, "threw a piece of their kit away");
      void refresh();
    });

  const doKit = (code: string): Promise<void> =>
    act(async () => {
      const e = emoji.owned.find((o) => o.code === code);
      const ok = await ask({
        title: "THE STANDARD KIT",
        body: `Trade ${e?.name ?? "this rare emoji"} for a yellow hazmat suit + a spray can? The emoji is DESTROYED.`,
        confirm: "trade it",
        danger: true,
      });
      if (!ok) return;
      await api.backroomsKit(code);
      kitPicking = false;
      say(`"Suit up. Try to bring it back unmelted."`, "took the Standard Kit — a hazmat suit, a spray can and a flashlight — to go down through the seam");
      void refreshOwned();
      void refresh();
    });

  // ---- Admin: wipe the community map (the launch valve) ---------------------
  const doWorldReset = (): Promise<void> =>
    act(async () => {
      const ok = await ask({
        title: "RESET THE COMMUNITY MAP",
        body:
          "Erases ALL exploration fog, every spray mark, every body and dropped item, and the death ledger for Sector A. " +
          "Player lockers, silver and unlocked relics are untouched. This cannot be undone — it's the clean sheet for launch.",
        confirm: "wipe Sector A",
        danger: true,
      });
      if (!ok) return;
      const r = await api.backroomsReset();
      say(`"Records purged. ${r.marks} marks, ${r.corpses} bodies, ${r.drops} drops. We were never here."`);
      void refresh();
    });

  /** The TESTING reset: everything above, plus the community's progress, so the
   *  discovery loop can be played again from nothing. Deliberately a separate
   *  button with its own confirm — this is the only thing in the game that can
   *  take an unlocked relic back off someone. */
  const doDeepReset = (): Promise<void> =>
    act(async () => {
      const ok = await ask({
        title: "WIPE ALL COMMUNITY PROGRESS",
        body:
          "Everything the normal reset does, AND: every relic anyone has ever unlocked is erased from their collection, " +
          "the entire Research archive is emptied, every drive goes back into the world, and THE DOOR relocks — " +
          "Level 1 becomes unopened. Lockers, gear and silver survive. This is a TESTING tool and it cannot be undone. " +
          "It takes back work that other people did.",
        confirm: "erase all progress",
        danger: true,
        // Nobody misclicks their way through a keyboard.
        typeToConfirm: "ERASE",
      });
      if (!ok) return;
      const r = await api.backroomsReset(true);
      say(
        `"Everything. ${r.relics} relic records, ${r.drives} recovered drives, the door itself. ` +
          `As if nobody had ever been down there."`,
      );
      void refresh();
    });

  /** THE POOLROOMS LEVER: open THE DOOR for everyone (the key's job, done by
   *  the house — a player already found the key, so the operator can throw
   *  the door open without waiting for the carry-it-across-the-map run). */
  const doOpenPools = (): Promise<void> =>
    act(async () => {
      const ok = await ask({
        title: "OPEN THE POOLROOMS",
        body:
          "Unlocks THE DOOR for the whole community, permanently — the same one-shot flag the key sets. " +
          "Anyone standing at THE DOOR can then step through into Level 1. This cannot be relocked " +
          "(except by the deep testing reset).",
        confirm: "open the door",
        danger: true,
      });
      if (!ok) return;
      const r = await api.backroomsOpenPools();
      say(r.fresh ? `"The lock turns. The water is waiting."` : `"It was already open — ${r.openedBy ?? "someone"} beat you to it."`);
      void refresh();
    });

  // ---- THE RESEARCH ARCHIVE ------------------------------------------------
  // Everything anyone has ever dragged out of Level 0, readable by everyone.
  // Drives nobody has found aren't listed, teased or counted — the archive
  // reads as bottomless until it isn't, and it never shrinks.
  type Research = Awaited<ReturnType<typeof api.backroomsResearch>>;
  let research = $state<Research | null>(null);
  let openDrive = $state<Research["entries"][number] | null>(null);

  async function loadResearch(): Promise<void> {
    try {
      research = await api.backroomsResearch();
    } catch {
      research = null;
    }
  }

  // The section has TABS now (Josh's layout): Home / Locker / Threshold-4 /
  // Research.
  let tab = $state<"home" | "locker" | "voss" | "research">("home");
  $effect(() => {
    if (tab === "research" && !research) void loadResearch();
  });
  $effect(() => {
    if (tab === "home" && map) setTimeout(draw, 0); // canvas remounts per tab
  });

  onMount(() => {
    void refresh();
    // The wallet is the shared app-wide store; Threshold-4 spends out of the
    // same purse as everything else, so it must be loaded and left accurate.
    void loadWallet();
    // Gated on the game (Sep 2026 review): with BackroomsGame mounted the
    // draw() bails anyway, so the four requests + ~100KB parse every 5s were
    // pure waste on the render thread of a running 3D world.
    poll = window.setInterval(() => { if (!brGame.active) void refresh(); }, 5_000); // live positions want a quick pulse
    // Her idle line rotates on Sterling's cadence. The first one waits for
    // /me to land so it can actually know your file.
    idleTimer = window.setInterval(() => rollVossLine(tab === "voss" ? "threshold" : "station"), 22_000);
    void fetch(DOWNLOAD_URL, { method: "HEAD" })
      .then((r) => (downloadReady = r.ok))
      .catch(() => {});
  });
  onDestroy(() => {
    clearInterval(poll);
    clearInterval(idleTimer);
    clearTimeout(noteTimer);
    brGame.active = false;
  });

  // First line once her payload has landed (it reads relics, the locker and
  // the budget, so a line rolled before /me arrives would be generic).
  $effect(() => {
    if (me && !vossIdle) rollVossLine();
  });

  // null = browsing this page; a number = inside that door, game mounted.
  let playingDoor = $state<number | null>(null);
  // Loadout picking (Josh's B3): choose locker items to carry in — 5 slots,
  // 9 with a backpack among them. The server re-validates on enter.
  let pickingDoor = $state<number | null>(null);
  let pickSel = $state<number[]>([]);
  let runLoadout = $state<number[]>([]);
  const GLYPH: Record<string, string> = {
    flashlight: "🔦",
    walkie: "📻",
    camera: "📷",
    spraycan: "🖌",
    backpack: "🎒",
    suit: "🦺",
    pills: "💊",
    battery: "🔋",
    almondwater: "🥛",
  };
  // Real model pictures (Josh's assets/gear drops, staged + committed).
  // Store renders of the actual models (Josh's set, Aug 2026) — backpack and
  // hazmat suit deliberately keep their original art.
  const GEAR_IMG: Record<string, string> = {
    flashlight: "/assets/gear/store/flashlight.webp",
    walkie: "/assets/gear/store/walkietalkie.webp",
    camera: "/assets/gear/store/camera.webp",
    spraycan: "/assets/gear/store/spraycan.webp",
    backpack: "/assets/gear/backpack.png",
    suit: "/assets/gear/suit.png",
    pills: "/assets/gear/store/pills.webp",
    battery: "/assets/gear/store/battery.webp",
    almondwater: "/assets/gear/store/bottle.webp",
    tape: "/assets/gear/tape.png",
  };
  const kindOf = (id: number): string => me?.items.find((i) => i.id === id)?.kind ?? "";
  const selHasSuit = $derived(pickSel.some((id) => kindOf(id) === "suit"));
  const carriedSel = $derived(
    pickSel.filter((id) => kindOf(id) !== "suit" && kindOf(id) !== "backpack"),
  );
  const pickCap = $derived(pickSel.some((id) => kindOf(id) === "backpack") ? 9 : 5);
  const ownsSuit = $derived(me?.items.some((i) => i.kind === "suit") ?? false);
  const pickGroups = $derived([
    { title: "SUITS (worn — required)", items: me?.items.filter((i) => i.kind === "suit") ?? [] },
    {
      title: "EQUIPMENT",
      items:
        me?.items.filter((i) => ["flashlight", "walkie", "camera", "spraycan"].includes(i.kind)) ??
        [],
    },
    {
      title: "CONSUMABLES",
      items: me?.items.filter((i) => ["pills", "battery", "almondwater"].includes(i.kind)) ?? [],
    },
    { title: "STORAGE (worn)", items: me?.items.filter((i) => i.kind === "backpack") ?? [] },
  ]);
  function enterDoor(i: number): void {
    pickingDoor = i;
    playingLevel = selLevel;
    pickSel = [];
  }
  // arriving from the map editor's Test play: that level, loadout open
  $effect(() => {
    const l = brTest.level;
    if (l === null) return;
    brTest.level = null;
    selLevel = l;
    void refresh();
    enterDoor(0);
  });
  function togglePick(id: number): void {
    if (pickSel.includes(id)) {
      pickSel = pickSel.filter((x) => x !== id);
      return;
    }
    const kind = kindOf(id);
    if (kind === "suit") pickSel = [...pickSel.filter((x) => kindOf(x) !== "suit"), id];
    else if (kind === "backpack") pickSel = [...pickSel.filter((x) => kindOf(x) !== "backpack"), id];
    else if (carriedSel.length < pickCap) pickSel = [...pickSel, id];
  }
  function confirmEnter(): void {
    if (!selHasSuit || carriedSel.length > pickCap) return;
    runLoadout = [...pickSel];
    playingDoor = pickingDoor;
    pickingDoor = null;
    brGame.active = true;
  }
  // A RUN LEFT STANDING (Josh, Sep 2026: "I cannot access the pool rooms it
  // just takes me to the backrooms"). Leaving without an exit freezes the run
  // for two minutes, and ANY door picks that body back up where it stands —
  // so the Poolrooms button put you back in Level 0. The hub says so now, and
  // going back in is one button (the server ignores a loadout on a resume).
  let runLostAt = $state<number | null>(null);
  let runNow = $state(Date.now());
  $effect(() => {
    if (runLostAt == null) return;
    const t = window.setInterval(() => (runNow = Date.now()), 1000);
    return () => window.clearInterval(t);
  });
  const runLeft = $derived(runLostAt == null ? 0 : Math.max(0, runLostAt - runNow));
  const LEVEL_NAME = ["Level 0", "the Poolrooms", "Pipe Dreams", "the Electrical Station", "the Abandoned Office", "the Terror Hotel", "Lights Out", "Thalassophobia", "the Cave System", "the Suburbs"];
  function resumeRun(): void {
    const r = status?.myRun;
    if (!r) return;
    selLevel = r.level;
    playingLevel = r.level;
    runLoadout = [];
    playingDoor = 0;
    brGame.active = true;
  }

  function exitGame(): void {
    playingDoor = null;
    brGame.active = false;
    void refresh(); // the walk just charted new cells — redraw the map
  }

  const pct = $derived(map ? ((map.exploredCells / map.totalCells) * 100).toFixed(2) : "0.00");
</script>

{#if asking}
  <div class="pickov askov">
    <div class="pickcard narrow">
      <h2 class:danger={asking.danger}>{asking.title}</h2>
      <p class="askbody">{asking.body}</p>
      {#if asking.typeToConfirm}
        <!-- Type-to-confirm. A second "are you sure?" is still one click, and
             one click is what we're guarding against — this cannot be
             dismissed by reflex. -->
        <label class="asktype">
          <span>Type <b>{asking.typeToConfirm}</b> to unlock this:</span>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            bind:value={typed}
            autocomplete="off"
            spellcheck="false"
            autofocus
            placeholder={asking.typeToConfirm}
            onkeydown={(e) => {
              if (e.key === "Enter" && askArmed) answer(true);
              if (e.key === "Escape") answer(false);
            }}
          />
        </label>
      {/if}
      <div class="pickrow">
        <button
          class="vbtn"
          class:danger={asking.danger}
          disabled={!askArmed}
          onclick={() => answer(true)}
        >
          {asking.confirm}
        </button>
        <button class="vbtn ghost" onclick={() => answer(false)}>never mind</button>
      </div>
    </div>
  </div>
{/if}

{#if kitPicking}
  <div class="pickov">
    <div class="pickcard">
      <h2>THE STANDARD KIT</h2>
      <p class="pickhint">
        One <b>rare</b> emoji buys a yellow hazmat suit, a spray can and a
        flashlight — the way in when you are short of silver. Once per
        surveyor: it is a starter kit, not an allowance. Pick which rare Voss
        gets; it is <b>destroyed</b>.
      </p>
      {#if ownedRares.length}
        <div class="emogrid">
          {#each ownedRares as e (e.code)}
            <button class="emochip" title={e.name} onclick={() => doKit(e.code)} disabled={busy}>
              <img src={`/emoji/${e.file}`} alt={e.name} />
              <span class="emoname">{e.name}</span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="pickwarn">You don't own a rare emoji. The Wheel is upstairs.</p>
      {/if}
      <div class="pickrow">
        <button class="vbtn ghost" onclick={() => (kitPicking = false)}>close</button>
      </div>
    </div>
  </div>
{/if}

{#if relicCard}
  {@const slug = relicCard}
  <div class="pickov" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) relicCard = null; }}>
    <div class="pickcard narrow">
      <h2>{relicName(slug).toUpperCase()}</h2>
      <div class="itemhead">
        <img class="itemimg relicbig" src={relicImg(slug)} alt={relicName(slug)} />
        <div class="iteminfo">
          <p class="bdesc">{relicDesc(slug)}</p>
          {#if ETCHED_RELICS[slug] !== undefined}
            <p class="etch"><Glyph id={ETCHED_RELICS[slug]} lit size={26} /><span>A mark is cut into it. Nothing on Earth writes like that.</span></p>
          {/if}
        </div>
      </div>
      <p class="adanote"><span>DR. VOSS</span>"{relicAda(slug)}"</p>
      <button class="vbtn ghost wide" onclick={() => (relicCard = null)}>close</button>
    </div>
  </div>
{/if}

{#if picked}
  {@const def = me?.catalog.find((g) => g.kind === picked!.kind)}
  <div class="pickov">
    <div class="pickcard narrow">
      <h2>{itemLabel(picked.kind, picked.color).toUpperCase()}</h2>
      <div class="itemhead">
        {#if itemImg(picked.kind, picked.color)}
          <img
            class="itemimg"
            src={itemImg(picked.kind, picked.color)}
            alt={itemLabel(picked.kind, picked.color)}
            style={picked.kind === "suit" ? suitPicStyle(picked.color) : ""}
          />
        {:else}
          <span class="itemimg bglyph">{GLYPH[picked.kind] ?? "▪"}</span>
        {/if}
        <div class="iteminfo">
          {#if def}
            <p class="bdesc">{def.desc}</p>
            <p class="bname">{def.levels[picked.level] ?? def.levels[0]}</p>
          {:else if picked.kind === "relic"}
            <p class="bdesc">{relicDesc(picked.color ?? "")}</p>
            <p class="bdesc">Async buys duplicates outright — {fmt(me?.prices.relic ?? 1000)} silver.</p>
          {:else if picked.kind === "tape"}
            <p class="bdesc">Entity footage — {picked.color ?? "far"} range.</p>
          {:else if picked.kind === "suit"}
            <p class="bdesc">Your protection. No suit, no door opens.</p>
          {/if}
          {#if (def?.maxLevel ?? 0) > 0}
            <span class="lpips">
              {#each Array(3) as _, p (p)}<span class="pip" class:lit={picked.level > p}></span>{/each}
            </span>
          {/if}
        </div>
      </div>

      {#if (def?.maxLevel ?? 0) > 0}
        {#if picked.level < (def?.maxLevel ?? 0)}
          <button
            class="vbtn wide"
            disabled={busy || !canAfford(me?.prices.upgrade[picked.level + 1] ?? 999999)}
            onclick={() => {
              const id = picked!.id;
              const next = picked!.level + 1;
              void doUpgrade(id).then(() => {
                if (picked?.id === id) picked = { ...picked, level: next };
              });
            }}
          >upgrade to level {picked.level + 1} · {fmt(me?.prices.upgrade[picked.level + 1] ?? 0)} silver</button>
        {:else}
          <p class="pnote">Fully calibrated — level {picked.level} is as good as it gets.</p>
        {/if}
      {/if}

      {#if picked.kind === "spraycan"}
        <p class="pickcat">PAINT COLOR — free, change it whenever</p>
        <div class="swatches">
          {#each me?.prices.sprayColors ?? [] as c (c)}
            <button
              class="swatch"
              class:on={(picked.color ?? "black") === c}
              title={c}
              disabled={busy}
              onclick={() => doSpray(picked!.id, c)}
            >
              <span class="dot" style="background:{sprayCss(c)}"></span>
              {c}
            </button>
          {/each}
        </div>
      {/if}

      {#if RESEARCH.has(picked.kind)}
        <button
          class="vbtn wide"
          disabled={busy || !grantCanPay(turnInPrice(picked.kind, picked.color))}
          onclick={() => doTurnIn(picked!.id, picked!.kind, picked!.color)}
        >turn in · {fmt(turnInPrice(picked.kind, picked.color))} silver</button>
        {#if !grantCanPay(turnInPrice(picked.kind, picked.color))}
          <p class="hint-line">
            Async's acquisition account is short — {fmt(grantSilver)} silver against a
            {fmt(turnInPrice(picked.kind, picked.color))} valuation. She won't part-buy. Hold it,
            or sell it to another player on the Auction House.
          </p>
        {/if}
      {:else if picked.kind === "suit" && ISSUED_SUITS.has(picked.color ?? "")}
        <p class="hint-line">Issued, not bought — the locker replaces it if it's ever lost.</p>
      {:else}
        <button
          class="vbtn ghost wide"
          disabled={busy}
          onclick={() => doDiscard(picked!.id, picked!.kind, picked!.color)}
        >discard</button>
        <p class="hint-line">Threshold-4 buys findings, not equipment. Discarding returns nothing.</p>
      {/if}
      <button class="vbtn ghost wide" onclick={() => (picked = null)}>close</button>
    </div>
  </div>
{/if}

{#if openDrive}
  <div class="pickov">
    <div class="pickcard readerpanel">
      <p class="rkicker">RECOVERED HARD DRIVE · {openDrive.id}</p>
      <h2>{openDrive.title}</h2>
      <p class="rfile">{openDrive.file}</p>
      <div class="rbody">{openDrive.body}</div>
      {#if openDrive.ada}
        <p class="rada"><b>DR. A. VOSS — THRESHOLD-4</b>{openDrive.ada}</p>
      {/if}
      <p class="rfoot">
        Recovered by <b>{openDrive.finder}</b> · {new Date(openDrive.at).toLocaleDateString()}
      </p>
      <div class="pickrow">
        <button class="vbtn ghost" onclick={() => (openDrive = null)}>close</button>
      </div>
    </div>
  </div>
{/if}

{#if pickingDoor !== null}
  <div class="pickov">
    <div class="pickcard">
      <h2>LOADOUT · {(playingLevel === 9 ? status?.suburbDoors?.[pickingDoor]?.name : playingLevel === 8 ? status?.caveDoors?.[pickingDoor]?.name : playingLevel === 7 ? status?.oceanDoors?.[pickingDoor]?.name : playingLevel === 6 ? status?.lightsDoors?.[pickingDoor]?.name : playingLevel === 5 ? status?.hotelDoors?.[pickingDoor]?.name : playingLevel === 4 ? status?.officeDoors?.[pickingDoor]?.name : playingLevel === 3 ? status?.stationDoors?.[pickingDoor]?.name : playingLevel === 2 ? status?.pipesDoors?.[pickingDoor]?.name : playingLevel === 1 ? status?.poolsDoors?.[pickingDoor]?.name : status?.doors[pickingDoor]?.name) ?? "the door"}</h2>
      <p class="pickhint">
        A hazmat suit is <b>required</b>. Suit + backpack are worn (no slot);
        carry up to {pickCap} items. What you carry, you can lose.
      </p>
      {#if !ownsSuit}
        <p class="pickwarn">
          You don't own a suit — Threshold-4 sells the Standard Kit for one
          rare emoji.
        </p>
      {/if}
      {#each pickGroups as g (g.title)}
        {#if g.items.length}
          <h3 class="pickcat">{g.title}</h3>
          <div class="pickgrid">
            {#each g.items as item (item.id)}
              <button
                class="pickcard2"
                class:on={pickSel.includes(item.id)}
                onclick={() => togglePick(item.id)}
              >
                {#if GEAR_IMG[item.kind]}
                  <!-- a suit row wears its colorway, like the detail card -->
                  <img src={itemImg(item.kind, item.color)} alt={gearName(item.kind)} style={item.kind === "suit" ? suitPicStyle(item.color) : ""} />
                {:else}
                  <span class="pglyph">{GLYPH[item.kind] ?? "▪"}</span>
                {/if}
                <span class="pname">{gearName(item.kind)}</span>
                <span class="pmeta">L{item.level}{item.color ? ` · ${item.color}` : ""}</span>
              </button>
            {/each}
          </div>
        {/if}
      {/each}
      <div class="pickrow">
        <!-- deselecting the backpack can leave more picked than the cap
             (Oct 2026 review): the server refused with a bare "won't open" -->
        <button class="vbtn" disabled={!selHasSuit || carriedSel.length > pickCap} onclick={confirmEnter}>
          {!selHasSuit ? "suit required" : carriedSel.length > pickCap ? `too many — carry ${pickCap}` : `enter with ${pickSel.length}`}
        </button>
        <button class="vbtn ghost" onclick={() => (pickingDoor = null)}>cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if playingDoor !== null}
  <div class="gamewrap">
    {#await import("../backrooms/BackroomsGame.svelte")}
      <div class="gameload"><span>finding the door…</span></div>
    {:then M}
      <M.default door={playingDoor} loadout={runLoadout} enterLevel={playingLevel} onExit={exitGame} />
    {:catch}
      <div class="gameload">
        <span>the game bundle failed to load — refresh and try again.</span>
        <button onclick={exitGame}>back</button>
      </div>
    {/await}
  </div>
{/if}

<div class="br">
  <div class="inner">
    <header>
      <p class="kicker">AN ASYNC FIELD PROGRAM</p>
      <h1>THE BACKROOMS</h1>
      <p class="sub">
        Level 0 · Sector A · one shared world, one door, sixteen at a time.
        Everything anyone has ever walked is drawn below. Everything else is
        still out there.
      </p>
    </header>

    <nav class="tabs">
      <button class:on={tab === "home"} onclick={() => (tab = "home")}>HOME</button>
      <button class:on={tab === "locker"} onclick={() => (tab = "locker")}>LOCKER</button>
      <button class:on={tab === "voss"} onclick={() => (tab = "voss")}>THRESHOLD-4</button>
      <button class:on={tab === "research"} onclick={() => (tab = "research")}>RESEARCH</button>
      <span class="tabrc"><Coin size={13} /> {fmt(wallet.coins)}</span>
    </nav>

    {#if tab === "home"}
      <section class="mapwrap">
        <div class="maphead">
          <span class="mh-title">COMMUNITY MAP · {selLevel === 8 ? "LEVEL 8 — THE CAVE SYSTEM" : selLevel === 7 ? "LEVEL 7 — THALASSOPHOBIA" : selLevel === 6 ? "LEVEL 6 — LIGHTS OUT" : selLevel === 5 ? "LEVEL 5 — THE TERROR HOTEL" : selLevel === 4 ? "LEVEL 4 — THE ABANDONED OFFICE" : selLevel === 3 ? "LEVEL 3 — THE ELECTRICAL STATION" : selLevel === 2 ? "LEVEL 2 — PIPE DREAMS" : selLevel === 1 ? "LEVEL 1 — THE POOLROOMS" : "LEVEL 0 — SECTOR A"}</span>
          <span class="mh-stat">
            {pct}% charted · {map?.exploredCells.toLocaleString() ?? "—"} of {map?.totalCells.toLocaleString() ?? "—"} cells{status?.players?.length ? ` · ${status.players.length} inside now` : ""}
            {#if session.user?.isAdmin}
              <!-- The launch valve: wipe the playtest before Level 0 opens. -->
              <!-- Gated on CONNECTED, matching the server: a frozen run whose
                   grace window is running out must not lock the button for two
                   minutes after the last person closed the game. -->
              <button class="wipe" disabled={busy || (status?.connected ?? 0) > 0} onclick={doWorldReset}>
                {(status?.connected ?? 0) > 0 ? "can't reset — players inside" : "reset map"}
              </button>
              <button class="wipe deep" disabled={busy || (status?.connected ?? 0) > 0} onclick={doDeepReset}>
                reset ALL progress
              </button>
              {#if map?.debug?.door && !map.debug.door.open}
                <!-- THE POOLROOMS LEVER: opens THE DOOR for everyone — the
                     same one-shot flag the key sets. Vanishes once open. -->
                <button class="wipe" disabled={busy} onclick={doOpenPools}>open the poolrooms</button>
              {/if}
            {/if}
          </span>
        </div>
        <div class="mapbody">
          <!-- THE DESCENT. Level 0 is home; Level 1 opens the moment somebody
               turns the key in THE DOOR down there (or the operator throws the
               lever), and the eight below are surveyed and out of reach. This
               board is FAST TRAVEL, never a way in: a level can only appear
               open here once its door has been opened. See the LEVELS table. -->
          <nav class="levels">
            <p class="railhead">
              THE DESCENT · {levelsOpen} OF {LEVELS.length} LEVELS OPEN
              <small>Every level holds the door to the next. This board only takes you back to one somebody already opened. — A. Voss</small>
            </p>
            {#each LEVELS as b, l (l)}
              <button
                class="lvl"
                class:on={selLevel === l}
                class:locked={l > 0 && !levelReachable(l)}
                class:next={l === levelsOpen}
                disabled={!levelReachable(l)}
                onclick={() => pickLevel(l)}
                title={l === 0
                  ? "Level 0 — where the seam opens. Open to everyone."
                  : l === 1 && level1Open
                    ? "Level 1 — its door on Level 0 has been opened."
                    : `Level ${l} — reached through the door on Level ${l - 1}, which nobody has opened yet.`}
              >
                <span class="lnum">{l}</span>
                <span class="lname">
                  {b.name}
                  <!-- SHORT. The rail is a ~130px column and the rule is
                       already stated once in the header above; spelling
                       "behind the door on Level N" onto every row wrapped all
                       ten of them to two lines and pushed the list into its
                       own scrollbar. The long form is the button's title. -->
                  <small>
                    {#if l === 0}LEVEL 0 · open to all
                    {:else if l === 1}LEVEL 1 · {level1Open ? "door open" : "its door is on 0"}
                    {:else if (l === 2 && level2Open) || (l === 3 && level3Open) || (l === 4 && level4Open) || (l === 5 && level5Open) || (l === 6 && level6Open) || (l === 7 && level7Open) || (l === 8 && level8Open) || (l === 9 && level9Open)}LEVEL {l} · door open
                    {:else if l === 2 && operator}LEVEL 2 · operator playtest
                    {:else if l === 3 && operator}LEVEL 3 · {status?.stationReady ? "door open · your gate" : "operator playtest"}
                    {:else if l === 4 && operator}LEVEL 4 · {status?.officeReady ? "door open · your gate" : "operator playtest"}
                    {:else if l === 5 && operator}LEVEL 5 · {status?.hotelReady ? "door open · your gate" : "operator playtest"}
                    {:else if l === 6 && operator}LEVEL 6 · {status?.lightsReady ? "door open · your gate" : "operator playtest"}
                    {:else if l === 7 && operator}LEVEL 7 · {status?.oceanReady ? "door open · your gate" : "operator playtest"}
                    {:else if l === 8 && operator}LEVEL 8 · {status?.caveReady ? "door open · your gate" : "operator playtest"}
                    {:else if l === 9 && operator}LEVEL 9 · {status?.suburbsReady ? "door open · your gate" : "operator playtest"}
                    {:else if l === levelsOpen}LEVEL {l} · its door is on {l - 1}
                    {:else}LEVEL {l} · not reached{/if}
                  </small>
                  <small class="lnote">{b.note}</small>
                </span>
              </button>
            {/each}
          </nav>
          <div class="scroll">
            <canvas bind:this={canvas}></canvas>
          </div>
        </div>
        {#if session.user?.isAdmin && map?.debug}
          <!-- Operator legend. Only rendered for admins, and only because the
               server chose to send `debug` at all. -->
          <p class="adminkey">
            OPERATOR VIEW · <b>full plan, no fog</b> ·
            <span class="lg ent">●</span> monster ({map.operator?.monsters.length ?? 0})
            <span class="lg relic">●</span> relic ({map.operator?.relics.length ?? 0})
            <span class="lg drive">■</span> lore drive ({map.operator?.drives.length ?? 0} left)
            <span class="lg door">□</span> objective ({map.operator?.objectives.length ?? 0} — keys, doors, hatch, fuses, breakers, cutoffs, shutter)
            <span class="lg body">✕</span> body ({map.operator?.bodies?.length ?? 0} — ringed if it carries a key or fuse)
            <span class="dim">— players never see any of this; the % charted above is still theirs</span>
          </p>
        {/if}
        {#if offline}
          <p class="offline">The map desk isn't answering — the backrooms may be offline server-side.</p>
        {/if}
      </section>

      <section class="card doorscard">
        <h2>THE DOORS</h2>
        {#if !ownsSuit}
          <p class="pickwarn">
            You need a hazmat suit before any door will open. Head to
            <b>THRESHOLD-4</b> and trade one rare emoji for the Standard Kit
            (suit + spray can + flashlight).
          </p>
        {/if}
        {#if status?.myRun}
          <div class="runwait">
            <p>
              {#if status.myRun.waiting}
                <b>Your run in {LEVEL_NAME[status.myRun.level]} is still going.</b>
                You left without going through a door, so you're standing where you stopped.
                Any door takes you back there. {#if runLeft > 0}If you don't go back in {Math.floor(runLeft / 60000)}:{String(Math.floor(runLeft / 1000) % 60).padStart(2, "0")}, it's lost to the dark.{/if}
              {:else}
                <b>You're already inside {LEVEL_NAME[status.myRun.level]}</b> in another window.
              {/if}
            </p>
            {#if status.myRun.waiting}
              <button class="enter" onclick={resumeRun}>go back in ▸</button>
            {/if}
          </div>
        {/if}
        {#if status}
          <p class="inside">{status.inside} / {status.cap} inside right now{selLevel === 1 && status.insideByLevel ? ` · ${status.insideByLevel[1]} in the pools` : ""}</p>
          <ul class:blocked={!!status.myRun}>
            {#if selLevel === 9}
              {#each status.suburbDoors ?? [] as d, i (d.name)}
                <li>
                  <span class="numeral">{ROMAN[i]}</span>
                  <span class="dname">{d.name}</span>
                  <span class="docc">{level9Open ? "way in + out" : "operator playtest"}</span>
                  <button class="enter" onclick={() => enterDoor(i)}>enter ▸</button>
                </li>
              {/each}
              {#if operator}
                <li>
                  <span class="numeral">⚑</span>
                  <span class="dname">THE SHIP GATE</span>
                  <span class="docc">{status.suburbsGate ? "members may enter" : "operator only"}</span>
                  <button class="enter" disabled={gateBusy} onclick={() => setSuburbsGate(!status?.suburbsGate)}>{status.suburbsGate ? "shut ▸" : "open ▸"}</button>
                </li>
              {/if}
            {:else if selLevel === 8}
              {#each status.caveDoors ?? [] as d, i (d.name)}
                <li>
                  <span class="numeral">{ROMAN[i]}</span>
                  <span class="dname">{d.name}</span>
                  <span class="docc">{level8Open ? "way in + out" : "operator playtest"}</span>
                  <button class="enter" onclick={() => enterDoor(i)}>enter ▸</button>
                </li>
              {/each}
              {#if operator}
                <li>
                  <span class="numeral">⚑</span>
                  <span class="dname">THE SHIP GATE</span>
                  <span class="docc">{status.caveGate ? "members may enter" : "operator only"}</span>
                  <button class="enter" disabled={gateBusy} onclick={() => setCaveGate(!status?.caveGate)}>{status.caveGate ? "shut ▸" : "open ▸"}</button>
                </li>
              {/if}
            {:else if selLevel === 7}
              {#each status.oceanDoors ?? [] as d, i (d.name)}
                <li>
                  <span class="numeral">{ROMAN[i]}</span>
                  <span class="dname">{d.name}</span>
                  <span class="docc">{level7Open ? "way in + out" : "operator playtest"}</span>
                  <button class="enter" onclick={() => enterDoor(i)}>enter ▸</button>
                </li>
              {/each}
              {#if operator}
                <li>
                  <span class="numeral">⚑</span>
                  <span class="dname">THE SHIP GATE</span>
                  <span class="docc">{status.oceanGate ? "members may enter" : "operator only"}</span>
                  <button class="enter" disabled={gateBusy} onclick={() => setOceanGate(!status?.oceanGate)}>{status.oceanGate ? "shut ▸" : "open ▸"}</button>
                </li>
              {/if}
            {:else if selLevel === 6}
              {#each status.lightsDoors ?? [] as d, i (d.name)}
                <li>
                  <span class="numeral">{ROMAN[i]}</span>
                  <span class="dname">{d.name}</span>
                  <span class="docc">{level6Open ? "way in + out" : "operator playtest"}</span>
                  <button class="enter" onclick={() => enterDoor(i)}>enter ▸</button>
                </li>
              {/each}
              {#if operator}
                <li>
                  <span class="numeral">⚑</span>
                  <span class="dname">THE SHIP GATE</span>
                  <span class="docc">{status.lightsGate ? "members may enter" : "operator only"}</span>
                  <button class="enter" disabled={gateBusy} onclick={() => setLightsGate(!status?.lightsGate)}>{status.lightsGate ? "shut ▸" : "open ▸"}</button>
                </li>
              {/if}
            {:else if selLevel === 5}
              {#each status.hotelDoors ?? [] as d, i (d.name)}
                <li>
                  <span class="numeral">{ROMAN[i]}</span>
                  <span class="dname">{d.name}</span>
                  <span class="docc">{level5Open ? "way in + out" : "operator playtest"}</span>
                  <button class="enter" onclick={() => enterDoor(i)}>enter ▸</button>
                </li>
              {/each}
              {#if operator}
                <li>
                  <span class="numeral">⚑</span>
                  <span class="dname">THE SHIP GATE</span>
                  <span class="docc">{status.hotelGate ? "members may enter" : "operator only"}</span>
                  <button class="enter" disabled={gateBusy} onclick={() => setHotelGate(!status?.hotelGate)}>{status.hotelGate ? "shut ▸" : "open ▸"}</button>
                </li>
              {/if}
            {:else if selLevel === 4}
              {#each status.officeDoors ?? [] as d, i (d.name)}
                <li>
                  <span class="numeral">{ROMAN[i]}</span>
                  <span class="dname">{d.name}</span>
                  <span class="docc">{level4Open ? "way in + out" : "operator playtest"}</span>
                  <button class="enter" onclick={() => enterDoor(i)}>enter ▸</button>
                </li>
              {/each}
              {#if operator}
                <li>
                  <span class="numeral">⚑</span>
                  <span class="dname">THE SHIP GATE</span>
                  <span class="docc">{status.officeGate ? "members may enter" : "operator only"}</span>
                  <button class="enter" disabled={gateBusy} onclick={() => setOfficeGate(!status?.officeGate)}>{status.officeGate ? "shut ▸" : "open ▸"}</button>
                </li>
              {/if}
            {:else if selLevel === 3}
              {#each status.stationDoors ?? [] as d, i (d.name)}
                <li>
                  <span class="numeral">{ROMAN[i]}</span>
                  <span class="dname">{d.name}</span>
                  <span class="docc">{level3Open ? "way in + out" : "operator playtest"}</span>
                  <button class="enter" onclick={() => enterDoor(i)}>enter ▸</button>
                </li>
              {/each}
              {#if operator}
                <li>
                  <span class="numeral">⚑</span>
                  <span class="dname">THE SHIP GATE</span>
                  <span class="docc">{status.stationGate ? "members may enter" : "operator only"}</span>
                  <button class="enter" disabled={gateBusy} onclick={() => setStationGate(!status?.stationGate)}>{status.stationGate ? "shut ▸" : "open ▸"}</button>
                </li>
              {/if}
            {:else if selLevel === 2}
              {#each status.pipesDoors ?? [] as d, i (d.name)}
                <li>
                  <span class="numeral">{ROMAN[i]}</span>
                  <span class="dname">{d.name}</span>
                  <span class="docc">{level2Open ? "way in + out" : "operator playtest"}</span>
                  <button class="enter" onclick={() => enterDoor(i)}>enter ▸</button>
                </li>
              {/each}
            {:else if selLevel === 1}
              {#each status.poolsDoors ?? [] as d, i (d.name)}
                <li>
                  <span class="numeral">{ROMAN[i]}</span>
                  <span class="dname">{d.name}</span>
                  <span class="docc">{i === 0 ? "the passage" : "arrival + exit"}</span>
                  <button class="enter" onclick={() => enterDoor(i)}>enter ▸</button>
                </li>
              {/each}
            {:else}
              {#each status.doors as d, i (d.name)}
                <li>
                  <span class="numeral">{ROMAN[i]}</span>
                  <span class="dname">{d.name.replace(/^Door [IVX]+ — /, "")}</span>
                  <span class="docc" class:live={d.inside > 0}>{d.inside > 0 ? `${d.inside} in` : "quiet"}</span>
                  <button class="enter" onclick={() => enterDoor(i)}>enter ▸</button>
                </li>
              {/each}
            {/if}
          </ul>
        {:else}
          <p class="inside">…</p>
        {/if}
        <p class="get dim playnote">
          First-person, co-op, open-mic proximity voice. The only way out is
          the way you came in. Everything you walk is charted forever.
          {#if downloadReady}
            <a class="dl secondary inline" href={DOWNLOAD_URL} download>⭳ standalone app (optional)</a>
          {/if}
        </p>
      </section>

      <div class="recents">
        <section class="card">
          <h2>RECENT RELICS</h2>
          {#if me?.relics.length}
            <ul class="deathlist">
              {#each [...me.relics].sort((x, y) => y.unlockedAt - x.unlockedAt).slice(0, 5) as r (r.relicId)}
                <li><b>{relicName(r.relicId)}</b> · {new Date(r.unlockedAt).toLocaleDateString()}</li>
              {/each}
            </ul>
            <p class="get dim">{me.relics.length} logged in your collection.</p>
          {:else}
            <p class="get dim">No relics recovered yet. They're out there — far from the doors.</p>
          {/if}
        </section>
        <section class="card">
          <h2>RECENT DEATHS</h2>
          {#if deaths.length}
            <ul class="deathlist">
              {#each deaths as d, i (i)}
                <li><b>{d.name}</b> — taken by {d.cause} · {new Date(d.at).toLocaleDateString()}</li>
              {/each}
            </ul>
          {:else}
            <p class="get dim">Nobody has died in Sector A. Yet.</p>
          {/if}
        </section>
        <section class="card lore">
          <h2>FIELD NOTE</h2>
          <p>
            "Subjects report the hum is loudest near the drain. We have not
            identified a source. We have stopped looking." — A. Voss,
            Threshold-4
          </p>
        </section>
      </div>
    {/if}

    <div class="band" class:hidden={tab === "home"}>
      {#if tab === "voss"}
      <section class="card vosscard">
        <div class="vosspic">
          <img class="vossimg" src="/assets/voss.webp" alt="Dr. Ada Voss" />
          <p class="vosscap">A. VOSS · ASYNC RESEARCH · STATION THRESHOLD-4</p>
          <!-- THE STATION LOG. Measured, Sep 2026: the portrait is 291px tall
               in a column that runs the card's full 1,039 — 734px of empty
               black beside the manifest. It is also the one place her standing
               figures belong: she is a woman who answers with a number, and
               the numbers were all buried in /ada. -->
          <dl class="stationlog">
            <dt>Retrieval, this quarter</dt>
            <dd>{RETRIEVAL_PCT}%</dd>
            <dt>Levels reachable</dt>
            <dd>{levelsOpen} of 10</dd>
            <dt>Your recoveries</dt>
            <dd>{me?.relics.length ?? 0}</dd>
            <dt>Your locker</dt>
            <dd>{me?.items.length ?? 0} / {me?.lockerSlots ?? 20}</dd>
            <dt>Recorded fatalities, yours</dt>
            <dd>{myDeaths}</dd>
          </dl>
          <p class="logfoot">
            She answers questions in any channel — <b>/ada help</b> is the list.
          </p>
        </div>
        <div class="vossbody">
          <div class="vosshead">
            <h2>THRESHOLD-4 · DR. ADA VOSS</h2>
            <span class="silverchip"><Coin size={14} /> {fmt(wallet.coins)}</span>
          </div>

          <!-- HER VOICE. The idle line rotates out of ada-lines.ts (Sterling's
               shape); anything she says in reply to an action overrides it
               until it times out. -->
          <p class="vnote" class:said={!!vossNote}>{vossNote || vossIdle}</p>

          <!-- ASYNC'S ACQUISITION ACCOUNT. Public on purpose: a counter that
               might refuse you should say so before you walk back out of the
               corridors carrying a relic. -->
          <div class="grantbox" class:low={grantState === "low"} class:dry={grantState === "dry"}>
            <div class="grantrow">
              <span class="grantlab">ACQUISITION ACCOUNT</span>
              <span class="grantnum">{fmt(grantSilver)} silver</span>
            </div>
            <div class="grantbar">
              <span style="width:{Math.max(0, Math.min(100, (grantSilver / Math.max(1, me?.grant.seed ?? 250000)) * 100))}%"></span>
            </div>
            <p class="grantnote">
              {#if grantState === "dry"}
                Not purchasing. Foundry disburses on its own schedule.
              {:else if grantState === "low"}
                Running down. Findings are still valued the same — she just may not be able to pay for a large one.
              {:else}
                Funded by the floor's losses. Findings are bought outright; equipment is not bought back.
              {/if}
            </p>
          </div>

          <h3>FIELD KIT</h3>
          <div class="buylist">
            {#each (me?.catalog ?? []).filter((g) => KIT.includes(g.kind)) as g (g.kind)}
              <div class="buyrow">
                {#if g.kind === "suit"}
                  <img class="bimg" src={suitPic(suitPick ?? "yellow")} alt={g.name} style={suitPicStyle(suitPick ?? "yellow")} />
                {:else if GEAR_IMG[g.kind]}
                  <img class="bimg" src={GEAR_IMG[g.kind]} alt={g.name} />
                {:else}
                  <span class="bimg bglyph">{GLYPH[g.kind] ?? "▪"}</span>
                {/if}
                <div class="binfo">
                  <span class="bname">{g.name}</span>
                  <span class="bdesc">{g.desc} · {g.levels[0]}</span>
                </div>
                <button class="vbtn" disabled={busy || !canAfford(g.price)} onclick={() => doBuy(g.kind)}>
                  {fmt(g.price)}
                </button>
              </div>
            {/each}
            <!-- Suit recolors: PICK a color (it highlights, and the preview
                 shows the actual in-game shade), then press the price to buy.
                 The old row fired a purchase on the color chip itself. -->
            <div class="buyrow suitrow">
              <img
                class="bimg"
                src={suitPic(suitPick ?? "yellow")}
                alt="Hazmat Suit"
                style={suitPicStyle(suitPick ?? "yellow")}
              />
              <div class="binfo">
                <span class="bname">
                  Hazmat Suit — {suitPick ? suitColorLabel(suitPick) : "choose a color"}
                </span>
                <div class="swatches">
                  {#each me?.prices.suitColors ?? [] as c (c)}
                    <button
                      class="swatch"
                      class:on={suitPick === c}
                      title={suitColorLabel(c)}
                      onclick={() => (suitPick = suitPick === c ? null : c)}
                    >
                      <span class="dot" style="background:{SUIT_SWATCH[c] ?? '#e8c33c'}"></span>
                      {suitColorLabel(c)}
                    </button>
                  {/each}
                </div>
              </div>
              <button
                class="vbtn"
                disabled={busy || !suitPick || !canAfford(me?.prices.suit ?? 400)}
                onclick={() => {
                  const c = suitPick!;
                  void doBuy("suit", c).then(() => (suitPick = null));
                }}
              >{fmt(me?.prices.suit ?? 400)}</button>
            </div>
            <div class="buyrow">
              <div class="binfo">
                <span class="bname">Standard Kit</span>
                <span class="bdesc">1 RARE emoji → yellow suit + spray can + flashlight</span>
              </div>
              <button class="vbtn" disabled={busy || !ownedRares.length} onclick={() => (kitPicking = true)}>
                trade a rare
              </button>
            </div>
            <div class="buyrow">
              <div class="binfo">
                <span class="bname">Locker expansion</span>
                <span class="bdesc">{me?.lockerSlots ?? 20} → {me?.prices.lockerMax ?? 40} slots</span>
              </div>
              <button
                class="vbtn"
                disabled={busy || (me?.lockerSlots ?? 20) >= (me?.prices.lockerMax ?? 40) || !canAfford(me?.prices.lockerUpgrade ?? 1000)}
                onclick={doLockerUp}
              >{(me?.lockerSlots ?? 20) >= (me?.prices.lockerMax ?? 40) ? "owned" : fmt(me?.prices.lockerUpgrade ?? 1000)}</button>
            </div>
          </div>

          <h3>OPTICS &amp; COMMS</h3>
          <div class="buylist">
            {#each (me?.catalog ?? []).filter((g) => OPTICS.includes(g.kind)) as g (g.kind)}
              <div class="buyrow">
                {#if GEAR_IMG[g.kind]}
                  <img class="bimg" src={GEAR_IMG[g.kind]} alt={g.name} />
                {:else}
                  <span class="bimg bglyph">{GLYPH[g.kind] ?? "▪"}</span>
                {/if}
                <div class="binfo">
                  <span class="bname">{g.name}</span>
                  <span class="bdesc">{g.desc} · {g.levels[0]}</span>
                </div>
                <button class="vbtn" disabled={busy || !canAfford(g.price)} onclick={() => doBuy(g.kind)}>
                  {fmt(g.price)}
                </button>
              </div>
            {/each}
          </div>

          <h3>SUPPLIES</h3>
          <div class="buylist">
            {#each (me?.catalog ?? []).filter((g) => SUPPLIES.includes(g.kind)) as g (g.kind)}
              <div class="buyrow">
                {#if GEAR_IMG[g.kind]}
                  <img class="bimg" src={GEAR_IMG[g.kind]} alt={g.name} />
                {:else}
                  <span class="bimg bglyph">{GLYPH[g.kind] ?? "▪"}</span>
                {/if}
                <div class="binfo">
                  <span class="bname">{g.name}</span>
                  <span class="bdesc">{g.desc}</span>
                </div>
                <button class="vbtn" disabled={busy || !canAfford(g.price)} onclick={() => doBuy(g.kind)}>
                  {fmt(g.price)}
                </button>
              </div>
            {/each}
          </div>

          <h3>SHE BUYS</h3>
          <div class="buylist">
            <div class="buyrow">
              <div class="binfo">
                <span class="bname">Relic — duplicate</span>
                <span class="bdesc">A second copy of something already on your shelf.</span>
              </div>
              <span class="pricetag">{fmt(me?.prices.relic ?? 1000)}</span>
            </div>
            {#each [["close", "≤3m"], ["mid", "≤10m"], ["far", "a distant glimpse"]] as [k, d] (k)}
              <div class="buyrow">
                <div class="binfo">
                  <span class="bname">Entity footage — {k} range</span>
                  <span class="bdesc">{d}. She pays by how close you were willing to stand.</span>
                </div>
                <span class="pricetag">{fmt(me?.prices.footage?.[k] ?? 0)}</span>
              </div>
            {/each}
          </div>
          <p class="get dim">
            Equipment has no resale here — Threshold-4 buys findings, not kit.
            Turn findings in from the LOCKER tab.
          </p>
        </div>
      </section>
      {/if}

      {#if tab === "research"}
      <section class="card researchcard">
        <h2>THE RESEARCH ARCHIVE</h2>
        <p class="get dim">
          Hard drives recovered from the levels below. When anyone carries one out it
          unlocks <b>for everyone on Solace</b>, permanently — this archive only
          ever grows. Drives nobody has found yet aren't listed here. They're
          still in there.
        </p>

        <!-- THE DOOR: the community's end goal for Level 0. -->
        <div class="doorpanel" class:open={research?.door.open}>
          {#if research?.door.open}
            <span class="dp-k">THE DOOR IS OPEN</span>
            <span class="dp-t">LEVEL 1 — THE POOLROOMS</span>
            <span class="dp-s">
              {research.door.openedBy} turned the key
              {research.door.at ? ` on ${new Date(research.door.at).toLocaleDateString()}` : ""}. It
              stays open. Forever.
            </span>
          {:else}
            <span class="dp-k">THE DOOR</span>
            <span class="dp-t">LOCKED</span>
            <span class="dp-s">
              Somewhere in Level 0 there is one door that doesn't belong — heavy,
              fixed, a keyhole where a handle should be. Somewhere else there is
              a key. Bring them together and <b>Level 1 opens for the whole
              community</b>, once, permanently. Die carrying the key and it drops
              with your body; when the body goes, the key goes home.
            </span>
          {/if}
        </div>

        {#if research && research.entries.length}
          <div class="drivelist">
            {#each [0, 1, 2, 3] as lv (lv)}
              {@const here = research.entries.filter((d) => d.level === lv)}
              {#if here.length}
                <p class="dv-level">{LEVEL_NAME[lv] ?? "Level " + lv}</p>
                {#each here as d (d.id)}
                  <button class="driverow" onclick={() => (openDrive = d)}>
                    <span class="dv-id">{d.id}</span>
                    <span class="dv-mid">
                      <span class="dv-title">{d.title}</span>
                      <span class="dv-file">{d.desc || d.file}</span>
                    </span>
                    <span class="dv-by">recovered by {d.finder}</span>
                  </button>
                {/each}
              {/if}
            {/each}
          </div>
        {:else if research}
          <p class="get dim">
            Nothing recovered yet. The drives are out there — scattered, far from
            the doors, waiting for somebody to walk that far.
          </p>
        {:else}
          <p class="get dim">Opening the archive…</p>
        {/if}
      </section>
      {/if}

      {#if tab === "locker"}
      <section class="card lockercard">
        <h2>LOCKERS — {me?.items.length ?? 0} / {me?.lockerSlots ?? 20}</h2>
        {#if me?.items.length}
          <p class="get dim">Click a slot to sell, upgrade or recolor what's in it.</p>
        {:else}
          <p class="get dim">Your gear between runs — nothing in it yet. Voss sells the basics.</p>
        {/if}
        <div class="lockergrid">
          {#each Array(me?.lockerSlots ?? 20) as _, i (i)}
            {@const it = me?.items[i]}
            {#if it}
              <button
                class="lslot full"
                title={`${itemLabel(it.kind, it.color)} · L${it.level}`}
                onclick={() => (picked = { ...it })}
              >
                {#if itemImg(it.kind, it.color)}
                  <img
                    src={itemImg(it.kind, it.color)}
                    alt={itemLabel(it.kind, it.color)}
                    style={it.kind === "suit" ? suitPicStyle(it.color) : ""}
                  />
                {:else}
                  <span class="bglyph">{GLYPH[it.kind] ?? "▪"}</span>
                {/if}
                {#if it.level > 0}<span class="lslot-lvl">L{it.level}</span>{/if}
                {#if it.kind === "spraycan"}
                  <span class="lslot-dot" style="background:{sprayCss(it.color)}"></span>
                {/if}
              </button>
            {:else}
              <div class="lslot"></div>
            {/if}
          {/each}
        </div>
        <h2 class="relich">UNLOCKED RELICS</h2>
        {#if me?.relics.length}
          <div class="relicrow">
            {#each me.relics as r (r.relicId)}
              <button class="relicchip" title="What is it?" onclick={() => (relicCard = r.relicId)}>
                <img src={relicImg(r.relicId)} alt={relicName(r.relicId)} />
                {relicName(r.relicId)}
              </button>
            {/each}
          </div>
        {:else}
          <p class="get dim">
            None recovered. The catalog size is not public knowledge — you'll
            know a relic when you see one floating.
          </p>
        {/if}
      </section>
      {/if}
    </div>
  </div>
</div>

<style>
  .br {
    height: 100%;
    overflow-y: auto;
    background:
      radial-gradient(ellipse 80% 50% at 50% 115%, rgba(201, 178, 106, 0.08), transparent 70%),
      #0a0906;
    color: #d8cfae;
  }
  .inner {
    max-width: 1180px;
    margin: 0 auto;
    padding: 34px clamp(16px, 4vw, 44px) 44px;
  }
  header {
    margin-bottom: 22px;
  }
  .kicker {
    margin: 0 0 4px;
    font-size: 0.68rem;
    letter-spacing: 0.34em;
    color: #6a6045;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: 0.3em;
    color: #c9b26a;
    text-shadow: 0 0 26px rgba(201, 178, 106, 0.25);
  }
  .sub {
    margin: 0;
    max-width: 62ch;
    font-size: 0.88rem;
    color: #9a8f6c;
  }
  .mapwrap {
    background: #0e0c08;
    border: 1px solid #2b2413;
    border-radius: 6px;
    overflow: hidden;
  }
  .maphead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 10px 14px;
    border-bottom: 1px solid #2b2413;
  }
  .mh-title {
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.26em;
    color: #9a8f6c;
  }
  .mh-stat {
    font-size: 0.74rem;
    color: #6a6045;
  }
  .adminkey {
    margin: 0.5rem 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.6rem;
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    color: #8d8360;
  }
  .adminkey .lg {
    font-size: 0.9rem;
    line-height: 1;
  }
  .adminkey .relic { color: #ffd965; }
  .adminkey .drive { color: #78beff; }
  .adminkey .door { color: #ff9a3d; }
  .adminkey .ent { color: #ff3b22; }
  .adminkey .body { color: #d6c8ff; }
  .adminkey .dim {
    color: #6a6045;
    font-style: italic;
  }
  .mapbody {
    display: flex;
    align-items: stretch;
  }
  /* THE TUNER's head — the seam's state, in her words. */
  .railhead {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 0 0 4px;
    padding: 0 2px 6px;
    border-bottom: 1px solid rgba(201, 178, 106, 0.18);
    color: #c9b26a;
    font-size: 0.6rem;
    font-weight: 900;
    letter-spacing: 0.14em;
  }
  .railhead small {
    font-weight: 500;
    font-style: italic;
    letter-spacing: 0.02em;
    text-transform: none;
    color: #8a8168;
  }
  /* One line of what the level actually IS — dimmer than its status, because
     a road map should read as a road map and not compete with the levels
     you can actually walk into. */
  .lnote {
    opacity: 0.62;
  }
  /* THE LEVELS rail — ten slots down the map's left edge. */
  .levels {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 8px;
    border-right: 1px solid rgba(201, 178, 106, 0.18);
    min-width: 198px;
    max-height: min(72vh, 790px);
    overflow-y: auto;
  }
  .lvl {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 9px;
    background: rgba(201, 178, 106, 0.05);
    border: 1px solid rgba(201, 178, 106, 0.16);
    border-radius: 5px;
    color: #b9a86e;
    cursor: pointer;
    text-align: left;
  }
  .lvl:hover:not(:disabled) {
    background: rgba(201, 178, 106, 0.13);
  }
  .lvl.on {
    background: rgba(201, 178, 106, 0.18);
    border-color: rgba(201, 178, 106, 0.55);
    color: #e8dcae;
  }
  .lvl:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .lvl.locked {
    opacity: 0.6;
  }
  /* THE NEXT ONE DOWN. Without this the eight unreached levels read as one
     undifferentiated wall, when exactly one of them is the one anybody can
     actually work towards — it is behind a door on a level people are already
     walking. A dashed edge and a little more light, nothing more: it is still
     shut, and a bright row would read as a button. */
  .lvl.next:disabled {
    opacity: 0.8;
    border-style: dashed;
    border-color: rgba(201, 178, 106, 0.4);
  }
  .lvl .lnum {
    font-weight: 900;
    font-size: 0.82rem;
    letter-spacing: 0.06em;
    min-width: 24px;
  }
  .lvl .lname {
    display: flex;
    flex-direction: column;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.09em;
    line-height: 1.3;
  }
  .lvl .lname small {
    font-weight: 500;
    letter-spacing: 0.03em;
    color: #7a6f4d;
    text-transform: none;
  }
  @media (max-width: 700px) {
    .mapbody {
      flex-direction: column;
    }
    .levels {
      flex-direction: row;
      overflow-x: auto;
      border-right: 0;
      border-bottom: 1px solid rgba(201, 178, 106, 0.18);
      min-width: 0;
    }
    .lvl {
      min-width: 130px;
    }
  }
  .scroll {
    flex: 1;
    overflow: auto;
    max-height: min(72vh, 790px);
  }
  canvas {
    display: block;
    image-rendering: pixelated;
  }
  .offline {
    margin: 0;
    padding: 10px 14px;
    font-size: 0.8rem;
    color: #c25a3a;
  }
  .card {
    padding: 14px 16px;
    background: #0e0c08;
    border: 1px solid #2b2413;
    border-radius: 6px;
  }
  .card h2 {
    margin: 0 0 10px;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.26em;
    color: #9a8f6c;
  }
  .inside {
    margin: 0 0 10px;
    font-size: 0.85rem;
    color: #c9b26a;
    font-weight: 700;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  li {
    display: flex;
    align-items: baseline;
    gap: 9px;
    font-size: 0.84rem;
  }
  .numeral {
    width: 20px;
    font-weight: 800;
    color: #c9b26a;
  }
  .dname {
    flex: 1;
    color: #d8cfae;
  }
  .docc {
    font-size: 0.72rem;
    color: #5d5540;
  }
  .docc.live {
    color: #5cdc78;
  }
  .get,
  .lore p {
    margin: 0;
    font-size: 0.8rem;
    color: #9a8f6c;
    line-height: 1.5;
  }
  .dl {
    display: block;
    margin-bottom: 10px;
    padding: 10px 14px;
    background: #c9b26a;
    border-radius: 4px;
    color: #171204;
    font-weight: 800;
    font-size: 0.85rem;
    letter-spacing: 0.06em;
    text-align: center;
    text-decoration: none;
  }
  .dl:hover {
    background: #e8d386;
  }
  .lore p {
    font-style: italic;
  }
  .enter {
    padding: 3px 10px;
    background: #c9b26a;
    border: none;
    border-radius: 3px;
    color: #171204;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    cursor: pointer;
  }
  .enter:hover {
    background: #e8d386;
  }
  .dl.secondary {
    margin: 10px 0 0;
    background: transparent;
    border: 1px solid #4a4128;
    color: #9a8f6c;
    font-weight: 600;
  }
  .dl.secondary:hover {
    border-color: #c9b26a;
    color: #d8cfae;
  }
  .dim {
    color: #6a6045 !important;
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }
  .tabs button {
    padding: 8px 20px;
    background: #0e0c08;
    border: 1px solid #2b2413;
    border-radius: 5px;
    color: #9a8f6c;
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    cursor: pointer;
  }
  .tabs button:hover {
    border-color: #4a4128;
  }
  .tabs button.on {
    background: rgba(201, 178, 106, 0.14);
    border-color: #c9b26a;
    color: #e8d386;
  }
  .tabrc {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    padding: 4px 12px;
    background: rgba(201, 178, 106, 0.14);
    border: 1px solid #4a4128;
    border-radius: 20px;
    color: #e8d386;
    font-weight: 800;
    font-size: 0.82rem;
  }
  .doorscard {
    margin-top: 16px;
  }
  .doorscard li {
    padding: 3px 0;
  }
  .playnote {
    margin-top: 12px !important;
  }
  .dl.inline {
    display: inline-block;
    margin: 6px 0 0;
    padding: 5px 12px;
  }
  .recents {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 14px;
    margin-top: 16px;
  }
  .band {
    display: block;
    margin-top: 0;
  }
  .band.hidden {
    display: none;
  }
  .vosscard {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }
  /* Dr. Voss is the face of Threshold-4 — she was postage-stamp sized (Josh).
     The source art is 1024², so this is still a downscale; the counter is a
     flex row that reflows to a column under 760px, so nothing clips. */
  .vosspic {
    flex: none;
    width: 260px;
    max-width: 38vw;
    /* The manifest is three times the portrait's height, so a static left
       column is mostly black by the time you reach SUPPLIES. Sticky keeps her
       and the log beside whatever you are reading — measured 575px of empty
       column before this, at 1400x1000. */
    position: sticky;
    top: 12px;
  }
  /* THE STATION LOG — the figures she would give you if you asked, in the
     column the portrait was leaving empty. Deliberately a definition list:
     it is a log, not a dashboard, so no bars and no colour. */
  .stationlog {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px 10px;
    margin: 12px 0 0;
    padding: 11px 12px;
    border: 1px solid rgba(201, 178, 106, 0.16);
    border-radius: 6px;
    background: rgba(201, 178, 106, 0.04);
    font-size: 0.68rem;
  }
  .stationlog dt {
    color: #7a6f4d;
    letter-spacing: 0.02em;
  }
  .stationlog dd {
    margin: 0;
    text-align: right;
    font-weight: 800;
    color: #c9b26a;
    font-variant-numeric: tabular-nums;
  }
  .logfoot {
    margin: 9px 2px 0;
    font-size: 0.66rem;
    line-height: 1.5;
    color: #6f6647;
  }
  .logfoot b {
    color: #9c8f5f;
    font-weight: 800;
  }
  .vossimg {
    display: block;
    width: 100%;
    border-radius: 6px 6px 0 0;
    border: 1px solid #2b2413;
    border-bottom: none;
  }
  /* A personnel plate rather than a floating picture — she is a posting, and
     the caption is what makes the portrait read as a station ID. */
  .vosscap {
    margin: 0;
    padding: 5px 8px;
    border: 1px solid #2b2413;
    border-radius: 0 0 6px 6px;
    background: rgba(201, 178, 106, 0.09);
    color: #9a8f6c;
    font-size: 0.56rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-align: center;
  }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .vosscard {
      flex-direction: column;
      align-items: stretch;
    }
    .vosspic {
      width: 100%;
      max-width: none;
      align-self: center;
    }
  }
  .lockergrid {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 5px;
    margin: 10px 0 14px;
  }
  .lslot {
    aspect-ratio: 1;
    background: rgba(90, 88, 84, 0.18);
    border: 1px solid #2b2413;
    border-radius: 3px;
  }
  .lslot.full {
    background: rgba(201, 178, 106, 0.12);
    border-color: #6a5c34;
  }
  .lslot {
    position: relative;
    overflow: hidden;
  }
  .lslot img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 4px;
    box-sizing: border-box;
  }
  .lslot-lvl {
    position: absolute;
    right: 2px;
    bottom: 1px;
    font-size: 0.6rem;
    font-weight: 800;
    color: #e8d386;
    text-shadow: 0 1px 2px #000;
  }
  .vossbody {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .vosshead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .silverchip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 10px;
    background: rgba(201, 178, 106, 0.14);
    border: 1px solid #4a4128;
    border-radius: 20px;
    color: #e8d386;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    font-size: 0.82rem;
    white-space: nowrap;
  }
  /* HER VOICE. Deliberately NOT Sterling's warm serif — she reads like a
     terminal line, because that is what she sounds like. The idle line is
     dim; anything she says in reply to you lifts. */
  .vnote {
    min-height: 2.4em;
    margin: 0;
    padding: 6px 9px;
    border-left: 2px solid #3b3526;
    background: rgba(201, 178, 106, 0.05);
    color: #9a8f6c;
    font-family: ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace;
    font-size: 0.74rem;
    line-height: 1.45;
    transition: color 0.18s ease, border-color 0.18s ease;
  }
  .vnote.said {
    border-left-color: #c9b26a;
    color: #d8c68a;
  }
  /* ASYNC'S ACQUISITION ACCOUNT — the funded budget she buys findings out of
     (src/backrooms/grant.ts). Public on purpose: a counter that might refuse
     you should say so before you walk back out carrying a relic. */
  .grantbox {
    margin: 4px 0 2px;
    padding: 8px 10px;
    border: 1px solid #4a4128;
    border-radius: 6px;
    background: rgba(90, 88, 84, 0.12);
  }
  .grantrow {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }
  .grantlab {
    color: #9a8f6c;
    font-size: 0.56rem;
    font-weight: 800;
    letter-spacing: 0.18em;
  }
  .grantnum {
    color: #e8d386;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    font-size: 0.82rem;
  }
  .grantbar {
    height: 5px;
    margin: 6px 0 5px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }
  .grantbar span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #6f6335, #c9b26a);
    transition: width 0.3s ease;
  }
  .grantbox.low .grantbar span {
    background: linear-gradient(90deg, #7a5a1d, #d99a3c);
  }
  .grantbox.dry .grantnum {
    color: #d98a7a;
  }
  .grantbox.dry .grantbar span {
    background: #6b3a33;
  }
  .grantnote {
    margin: 0;
    color: #8a8168;
    font-size: 0.66rem;
    line-height: 1.4;
  }
  /* A price she PAYS, not a button — the SHE BUYS list is a rate card. */
  .pricetag {
    align-self: center;
    padding: 3px 10px;
    border: 1px dashed #4a4128;
    border-radius: 6px;
    color: #c9b26a;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
    white-space: nowrap;
  }
  .vossbody h3 {
    margin: 8px 0 2px;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    color: #9a8f6c;
  }
  .vbtn {
    align-self: flex-start;
    padding: 6px 14px;
    background: #c9b26a;
    border: none;
    border-radius: 3px;
    color: #171204;
    font-weight: 800;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .vbtn:hover:not(:disabled) {
    background: #e8d386;
  }
  .vbtn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .buylist {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* A GRID, NOT A FLEX ROW, so the thumbnail column exists whether or not the
     row has a thumbnail. As a flex row the six image-less rows (the Standard
     Kit, the locker expansion and all four SHE BUYS lines) simply closed the
     gap and started their text 58px — the 46px image plus the 12px gap — to
     the left of every other row. Measured, not guessed: 585 against 643. */
  .buyrow {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }
  .buyrow > .binfo:first-child {
    grid-column: 2;
  }
  .binfo {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    text-align: left;
  }
  .bname {
    color: #d8cfae;
    font-weight: 700;
    font-size: 0.84rem;
  }
  ul.blocked {
    opacity: 0.45;
    pointer-events: none;
  }
  .runwait {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    border: 1px solid #b3261e;
    background: rgba(179, 38, 30, 0.12);
    border-radius: 6px;
    padding: 10px 12px;
    margin: 8px 0;
  }
  .runwait p {
    margin: 0;
    line-height: 1.45;
  }
  .runwait .enter {
    flex: none;
  }
  .bdesc {
    color: #6a6045;
    font-size: 0.74rem;
  }
  .bimg {
    width: 46px;
    height: 46px;
    object-fit: contain;
    border-radius: 4px;
    background: rgba(90, 88, 84, 0.14);
    flex-shrink: 0;
  }
  .bglyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
  }
  .lpips {
    display: flex;
    gap: 3px;
  }
  .pip {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(90, 88, 84, 0.4);
    border: 1px solid #4a4128;
  }
  .pip.lit {
    background: #c9b26a;
  }
  .deathlist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.8rem;
    color: #9a8f6c;
  }
  .deathlist b {
    color: #c98a72;
  }
  .relicrow {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .relicchip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 4px 12px 4px 5px;
    background: rgba(201, 178, 106, 0.14);
    border: 1px solid #8a6a2a;
    border-radius: 12px;
    color: #e8d386;
    font-size: 0.78rem;
  }
  .relicchip {
    cursor: pointer;
    font: inherit;
    font-size: 0.78rem;
  }
  .relicchip:hover {
    background: rgba(201, 178, 106, 0.26);
  }
  .relicchip img {
    width: 30px;
    height: 30px;
    object-fit: contain;
  }
  .relicbig {
    object-fit: contain !important;
    background: radial-gradient(circle, rgba(201, 178, 106, 0.18), transparent 70%) !important;
  }
  /* Dr. Voss's note on a relic, in the collection's card */
  .etch { display: flex; align-items: center; gap: 10px; margin: 8px 0 0; padding: 6px 8px; border: 1px dashed rgba(143, 211, 255, 0.35); border-radius: 6px; color: #b9d8ea; font-size: 0.82rem; --p-lit: #8fd3ff; }
  .adanote {
    margin: 10px 0 12px;
    padding: 10px 12px;
    border-left: 2px solid #5fb8a8;
    background: rgba(95, 184, 168, 0.08);
    color: #cfe6df;
    font-size: 0.8rem;
    line-height: 1.5;
    font-style: italic;
  }
  .adanote span {
    display: block;
    font-style: normal;
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    color: #5fb8a8;
    margin-bottom: 3px;
  }
  .relich {
    margin-top: 4px !important;
  }
  @media (max-width: 900px) {
    .band {
      grid-template-columns: 1fr;
    }
  }
  .pickov {
    position: fixed;
    inset: 0;
    z-index: 3999;
    background: rgba(4, 3, 2, 0.82);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pickcard {
    width: min(560px, 92vw);
    padding: 22px 24px;
    background: #0e0c08;
    border: 1px solid #2b2413;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pickcard h2 {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.26em;
    color: #c9b26a;
  }
  .pickhint {
    margin: 0;
    font-size: 0.8rem;
    color: #9a8f6c;
  }
  .pickgrid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pickrow {
    display: flex;
    gap: 8px;
  }
  .pickcard {
    max-height: 84vh;
    overflow-y: auto;
  }
  .pickhint b {
    color: #e8d386;
  }
  .pickwarn {
    margin: 0;
    padding: 8px 12px;
    background: rgba(194, 90, 58, 0.12);
    border: 1px solid rgba(194, 90, 58, 0.4);
    border-radius: 5px;
    color: #c98a72;
    font-size: 0.8rem;
  }
  .pickcat {
    margin: 6px 0 0;
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.24em;
    color: #6a6045;
  }
  .pickcard2 {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 108px;
    padding: 10px 8px;
    background: rgba(90, 88, 84, 0.16);
    border: 1px solid #4a4128;
    border-radius: 6px;
    cursor: pointer;
  }
  .pickcard2.on {
    background: rgba(201, 178, 106, 0.24);
    border-color: #c9b26a;
  }
  .pickcard2 img {
    width: 62px;
    height: 62px;
    object-fit: cover;
    border-radius: 4px;
  }
  .pglyph {
    font-size: 2.2rem;
    line-height: 62px;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.8));
  }
  .pname {
    color: #d8cfae;
    font-size: 0.76rem;
    font-weight: 700;
  }
  .pmeta {
    color: #9a8f6c;
    font-size: 0.68rem;
  }
  /* Still used by the Standard Kit picker (the emoji SELL grid it was also
     written for went with Voss's emoji counter in Sep 2026). */
  .emogrid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .emochip {
    padding: 5px;
    background: rgba(90, 88, 84, 0.16);
    border: 1px solid #4a4128;
    border-radius: 6px;
    cursor: pointer;
  }
  .emochip img {
    width: 44px;
    height: 44px;
    object-fit: contain;
    display: block;
  }
  .vbtn.ghost {
    background: transparent;
    border: 1px solid #4a4128;
    color: #9a8f6c;
  }
  .vbtn.ghost:hover {
    border-color: #c9b26a;
    color: #d8cfae;
  }
  .vbtn.danger {
    background: #7d2417;
    color: #ffdfd6;
  }
  .vbtn.danger:hover:not(:disabled) {
    background: #a12f1d;
  }
  .vbtn.wide {
    align-self: stretch;
    text-align: center;
  }
  /* ---- The house confirm (replacing browser confirm()) ------------------- */
  .askov {
    z-index: 4100; /* above the loadout/sell pickers that can raise it */
  }
  .pickcard.narrow {
    width: min(430px, 92vw);
  }
  .pickcard h2.danger {
    color: #e0563c;
  }
  .asktype {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.78rem;
    color: #b7ab86;
  }
  .asktype b {
    color: #e0563c;
    letter-spacing: 0.12em;
  }
  .asktype input {
    padding: 7px 10px;
    background: rgba(10, 8, 4, 0.6);
    border: 1px solid #4a4128;
    border-radius: 4px;
    color: #f0e6c2;
    font-family: ui-monospace, monospace;
    font-size: 0.9rem;
    letter-spacing: 0.1em;
  }
  .asktype input:focus {
    outline: none;
    border-color: #e0563c;
  }
  .vbtn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .askbody {
    margin: 0;
    color: #d8cfae;
    font-size: 0.86rem;
    line-height: 1.55;
  }
  .pnote {
    margin: 0;
    color: #6a6045;
    font-size: 0.76rem;
    line-height: 1.5;
  }
  /* ---- Color selectors (suit + spray) ----------------------------------- */
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .swatch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px 3px 6px;
    background: rgba(90, 88, 84, 0.2);
    border: 1px solid #4a4128;
    border-radius: 12px;
    color: #9a8f6c;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .swatch:hover:not(:disabled) {
    border-color: #c9b26a;
    color: #d8cfae;
  }
  .swatch.on {
    background: rgba(201, 178, 106, 0.22);
    border-color: #e8d386;
    color: #e8d386;
    font-weight: 700;
  }
  .swatch .dot {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.5);
    box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.35);
  }
  .suitrow .binfo {
    gap: 6px;
  }
  /* ---- The locker item card --------------------------------------------- */
  .itemhead {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .itemimg {
    width: 84px;
    height: 84px;
    object-fit: contain;
    border-radius: 5px;
    background: rgba(90, 88, 84, 0.14);
    flex-shrink: 0;
  }
  .iteminfo {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .emochip .emoname {
    display: block;
    max-width: 64px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #9a8f6c;
    font-size: 0.6rem;
  }
  .wipe {
    margin-left: 10px;
    padding: 2px 9px;
    background: rgba(125, 36, 23, 0.35);
    border: 1px solid #7d2417;
    border-radius: 10px;
    color: #e0917f;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  /* The progress wipe reads as the more dangerous of the two, because it is. */
  .wipe.deep {
    background: rgba(90, 12, 12, 0.5);
    border-color: #a01818;
    color: #ffb3a3;
  }
  .wipe:hover:not(:disabled) {
    background: #7d2417;
    color: #ffdfd6;
  }
  .wipe:disabled {
    opacity: 0.5;
    cursor: default;
  }
  /* ---- The Research archive ---------------------------------------------- */
  .doorpanel {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin: 12px 0;
    padding: 14px 16px;
    background: rgba(20, 24, 28, 0.6);
    border: 1px solid #2b3a44;
    border-radius: 6px;
  }
  .doorpanel.open {
    background: rgba(12, 34, 34, 0.55);
    border-color: #4f9f98;
  }
  .dp-k {
    font-size: 0.62rem;
    letter-spacing: 0.3em;
    font-weight: 800;
    color: #6a8593;
  }
  .doorpanel.open .dp-k {
    color: #6fc7c0;
  }
  .dp-t {
    font-size: 1rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    color: #b9c9d2;
  }
  .doorpanel.open .dp-t {
    color: #d6f5f1;
  }
  .dp-s {
    font-size: 0.8rem;
    line-height: 1.55;
    color: #7e8f99;
  }
  .dp-s b {
    color: #b9c9d2;
  }
  .drivelist {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .driverow {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    background: rgba(20, 28, 34, 0.5);
    border: 1px solid #253039;
    border-radius: 6px;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .driverow:hover {
    border-color: #4d7f96;
  }
  .dv-id {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.8rem;
    font-weight: 800;
    color: #4d7f96;
  }
  .dv-mid {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .dv-title {
    color: #9fd7ff;
    font-weight: 700;
    font-size: 0.86rem;
  }
  .dv-file {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.7rem;
    color: #55707e;
  }
  .dv-by {
    font-size: 0.72rem;
    color: #6a6045;
    white-space: nowrap;
  }
  .readerpanel {
    width: min(700px, 94vw);
  }
  .rkicker {
    margin: 0;
    font-size: 0.62rem;
    letter-spacing: 0.3em;
    color: #5d7f92;
  }
  .readerpanel h2 {
    color: #9fd7ff !important;
    font-size: 0.95rem !important;
    letter-spacing: 0.1em !important;
  }
  .rfile {
    margin: 0;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.74rem;
    color: #4f6a78;
  }
  .rbody {
    white-space: pre-wrap;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.84rem;
    line-height: 1.65;
    color: #c8d6dd;
    padding: 12px 14px;
    background: rgba(20, 32, 40, 0.45);
    border-left: 2px solid #2d4a5a;
    border-radius: 3px;
  }
  .rfoot {
    margin: 0;
    font-size: 0.74rem;
    color: #6a8593;
  }
  .rfoot b {
    color: #9fd7ff;
  }
  .lslot-dot {
    position: absolute;
    left: 3px;
    top: 3px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.6);
  }
  button.lslot {
    cursor: pointer;
    padding: 0;
  }
  button.lslot:hover {
    border-color: #c9b26a;
  }
  /* The game overlays the ENTIRE app (rail included) while inside. */
  .gamewrap {
    position: fixed;
    inset: 0;
    z-index: 4000;
    background: #0a0906;
  }
  .gameload {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: #d8cfae;
    letter-spacing: 0.08em;
  }
  .gameload button {
    padding: 8px 22px;
    background: #c9b26a;
    border: none;
    border-radius: 3px;
    color: #171204;
    font-weight: 700;
    cursor: pointer;
  }
  @media (max-width: 900px) {
    .recents {
      grid-template-columns: 1fr;
    }
  }
  .dv-level {
    margin: 10px 0 4px;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #c9b26a;
  }
  .rada {
    margin: 10px 0 0;
    padding: 8px 10px;
    border-left: 2px solid #4f7a8c;
    background: rgba(79, 122, 140, 0.1);
    font-size: 0.85rem;
    line-height: 1.5;
    color: #b9cdd6;
  }
  .rada b {
    display: block;
    margin-bottom: 3px;
    font-size: 0.66rem;
    letter-spacing: 0.12em;
    color: #7fa3b3;
  }
</style>
