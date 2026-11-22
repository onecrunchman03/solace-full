<script lang="ts">
  import { onMount } from "svelte";
  import { session, bootstrap, logout, recheckTerms } from "./lib/session.svelte";
  import { nav, go, openRumble, openProfile, resetNav } from "./lib/nav.svelte";
  import { resetWheel } from "./lib/wheel.svelte";
  import { resetEmoji } from "./lib/emoji.svelte";
  import { resetGraveyard } from "./lib/graveyard.svelte";
  import { chat, initRealtime, disconnectChat, selectChannel, reclaimSocket } from "./lib/chat.svelte";
  import { pages } from "./lib/pages.svelte";
  import { dm, resetDm, openConversation } from "./lib/dm.svelte";
  import { resetNpcVoice } from "./lib/npcvoice";
  import { resetAffinity } from "./lib/affinity.svelte";
  import { trade, resetTrades } from "./lib/trade.svelte";
  import { resetAuctions } from "./lib/auction.svelte";
  import { resetBlackjack } from "./lib/blackjack.svelte";
  import { resetRoulette } from "./lib/roulette.svelte";
  import { resetCraps } from "./lib/craps.svelte";
  import { resetHoldem } from "./lib/holdem.svelte";
  import { installErrorReporter } from "./lib/errorreport";
  import { resetDerby } from "./lib/derby.svelte";
  import { resetLottery } from "./lib/lottery.svelte";
  import { resetBlocks } from "./lib/blocks.svelte";
  import {
    status, setManualStatus, initStatusTracking, resetStatus,
    type StatusMode,
  } from "./lib/status.svelte";
  import { restoreDisplayMode, watchDisplayMode } from "./lib/display.svelte";
  import { resetChess } from "./lib/chessduel.svelte";
  import { resetEmporium } from "./lib/emporium.svelte";
  import { resetVip } from "./lib/vip.svelte";
  import { resetPandora } from "./lib/pandora.svelte";
  import { abyss, resetAbyss } from "./lib/abyss.svelte";
  import { resetPortal } from "./lib/portal.svelte";
  import AbyssStone from "./components/AbyssStone.svelte";
  import { resetWallet } from "./lib/wallet.svelte";
import { resetBoard } from "./lib/soundboard.svelte";
import { notify, setupPush } from "./lib/notify.svelte";
  import { resetLender } from "./lib/lender.svelte";
  import { resetFeedback } from "./lib/feedback.svelte";
  import { resetPit } from "./lib/bonepit.svelte";
  import { resetEvents } from "./lib/events.svelte";
  import { resetSidebets } from "./lib/sidebet.svelte";
  import { prefs, themePreview, endThemePreview, THEMES } from "./lib/prefs.svelte";
  import { openMarket } from "./lib/nav.svelte";
  import { voice, toggleMute, toggleDeafen, holdTalk, holdMute, leaveVoice } from "./lib/voice.svelte";
  import { ui } from "./lib/chat.svelte";
  import Login from "./components/Login.svelte";
  import RailIcon, { RAIL_TILES } from "./components/RailIcon.svelte";
  import Wake from "./components/Wake.svelte";
  import Cell from "./components/Cell.svelte";
  import Chat from "./components/Chat.svelte";
  import Feedback from "./components/Feedback.svelte";
  import Lazy from "./components/Lazy.svelte";
  import DirectMessages from "./components/DirectMessages.svelte";
  import Profile from "./components/Profile.svelte";
  import Settings from "./components/Settings.svelte";
  import SetSecretGate from "./components/SetSecretGate.svelte";
  import TermsGate from "./components/TermsGate.svelte";
  import Avatar from "./components/Avatar.svelte";
  import ConfirmDialog from "./components/ConfirmDialog.svelte";
  import VoiceControls from "./components/VoiceControls.svelte";
  import VideoStage from "./components/VideoStage.svelte";
  import { resetVoice } from "./lib/voice.svelte";
  import { appUpdate, applyUpdate } from "./lib/appupdate.svelte";
  import { preloadAllSfx } from "./lib/sfx";
  import { alertCount, initAlerts } from "./lib/alerts.svelte";
  import { achToasts } from "./lib/achievements.svelte";
  import { notices, dismissNotice, pushNotice } from "./lib/notices.svelte";
  import { isDesktopShell } from "./lib/platform";
  import { openLink, linkMessage } from "./lib/openlink";
  import { phone, phoneAllows, initPhoneMode } from "./lib/phone.svelte";

  let showSettings = $state(false);
  // PHONE MODE: the "You" tab opens a sheet (status, profile, settings, the
  // guide, feedback, sign out) — everything the desktop rail's bottom held.
  let youSheet = $state(false);
  // THE PAPERWORK: the Terms version in force rides the self view
  // (`termsCurrent`), so the gate decision below is synchronous — no
  // round-trip during which the app renders ungated, and no failed fetch
  // that would quietly skip the gate (review finding).
  const termsCurrent = $derived(session.user?.termsCurrent ?? null);
  // Terms outstanding = the app does not mount. The server refuses every
  // ordinary route and the socket until the account accepts (legal.ts), so
  // a shell behind the gate would only fill with 403s; the gate stands
  // alone, like the Wake, and the socket effect below keys off this too.
  // THE EXEMPTIONS MUST MATCH legal.ts's `termsOutstanding` EXACTLY. They
  // did not: the server exempts the Operator (who is not a party to a
  // contract with himself) and this did not, so the admin account was held
  // at a gate no route behind it would ever have enforced.
  const termsDue = $derived(
    !!session.user &&
      termsCurrent !== null &&
      !session.user.isBot &&
      !session.user.isAdmin &&
      (session.user.termsVersion ?? null) !== termsCurrent,
  );
  // A phone can't reach the 3D worlds, and only staff reach the Admin Panel.
  // If the view is one of those (a keybind, a notification, a rotation from a
  // desktop-width tablet, a demotion while the panel is open), go home.
  $effect(() => {
    if (phone.on && session.user && !phoneAllows(nav.view, session.user)) go("chat");
  });
  // On ANY device, a moderator demoted while the Admin Panel is open goes
  // home (Oct 2026 review — only the phone check above ever did).
  $effect(() => {
    const u = session.user;
    if (u && nav.view === "adminpanel" && !u.isAdmin && u.role !== "moderator") go("chat");
  });
  // Views with no tab of their own get a titled bar and a way back.
  const PHONE_TITLES: Record<string, string> = {
    profile: "Profile",
    feedback: "Feedback",
    howto: "How To Guide",
    leaderboards: "Leaderboards",
    adminpanel: "Admin Panel",
  };

  // ---- User status (online / away / busy) ----
  let statusMenuOpen = $state(false);
  const STATUS_OPTIONS: { id: StatusMode; name: string; hint: string }[] = [
    { id: "online", name: "Online", hint: "The default — here and pingable." },
    { id: "away", name: "Away", hint: "Around, but not at the tables." },
    { id: "busy", name: "Busy", hint: "Do not disturb — silences your pings." },
  ];
  const STATUS_LABEL: Record<StatusMode, string> = { online: "online", away: "away", busy: "busy" };
  // My effective status (manual pick or auto-away), rendered on the rail dot.
  const myStatus = $derived(status.manual !== "online" ? status.manual : status.autoAway ? "away" : "online");

  onMount(() => {
    void bootstrap();
    installErrorReporter(); // browser crashes → the Admin Panel's error tab
    initStatusTracking(); // idle → auto-away + the 24h forgotten-browser clock
    // Come back the way you left: the desktop shell re-takes fullscreen /
    // fullscreen-windowed at launch. In a browser this only starts WATCHING
    // (Esc and F11 must keep the setting honest) — a fullscreen request
    // without a click is refused, so it waits for the toggle.
    restoreDisplayMode();
    const unwatchDisplay = watchDisplayMode();
    const unwatchPhone = initPhoneMode();
    // A 403 `terms_required` from any call means the Terms moved under an
    // open session (a version bump mid-day): re-read the self view so the
    // gate appears, instead of an app where every button fails.
    const onTermsRequired = () => void recheckTerms();
    window.addEventListener("solace:terms-required", onTermsRequired);
    /**
     * EVERY LINK THAT LEAVES SOLACE, IN ONE PLACE.
     *
     * The desktop shell's webview has no second window, so an
     * `<a target="_blank">` there is a link that silently does nothing — no
     * tab, no error, no clue. That was true of every external link in the
     * app: the Exchange's news headlines (which is how it was found) and,
     * worse, every link to the Terms, the Guidelines and the Privacy Policy.
     *
     * Delegated rather than bolted onto each anchor, because it is a property
     * of the SHELL and not of any one screen — a link added next year is
     * covered without anybody remembering this. Shell 0.3.6 hands the URL to
     * the real browser; an older one cannot open anything at all, so it gets
     * the address on the clipboard and is told so.
     */
    const onExternalClick = (e: MouseEvent) => {
      if (!isDesktopShell) return;
      const el = (e.target as HTMLElement | null)?.closest?.('a[target="_blank"]') as HTMLAnchorElement | null;
      if (!el?.href) return;
      void openLink(e, el.href).then((r) => {
        const body = linkMessage(r);
        if (body) pushNotice({ title: "Link", body, tone: "plain", icon: "🔗" });
      });
    };
    document.addEventListener("click", onExternalClick);
    // The desktop shell calls this on X/Quit: stand up from voice + any game
    // seat, keep the session (still signed in next launch), then the shell
    // exits. sendBeacon because the window is about to die.
    (window as unknown as { __solaceExit?: () => void }).__solaceExit = () => {
      try {
        void leaveVoice();
      } catch {
        /* not in voice */
      }
      const token = localStorage.getItem("solace_token");
      if (token) navigator.sendBeacon(`/api/presence/exit?token=${encodeURIComponent(token)}`);
    };
    return () => {
      unwatchDisplay();
      unwatchPhone();
      window.removeEventListener("solace:terms-required", onTermsRequired);
      document.removeEventListener("click", onExternalClick);
    };
  });

  // Keep the shared realtime connection tied to the logged-in identity, not to
  // any one view — DMs and presence must survive navigating away from Chat.
  // Keyed on the id (a $derived), so profile edits that reassign session.user
  // don't churn the socket.
  const uid = $derived(session.user && !termsDue ? session.user.id : null);
  // The resets below are for a SIGN-OUT, not for the first paint (Oct 2026
  // review): at mount uid is null while bootstrap is still reading the
  // session, and resetVoice() cleared the refresh-rejoin key — so an F5 never
  // put you back in your voice room.
  let wasSignedIn = false;
  $effect(() => {
    if (uid != null) {
      wasSignedIn = true;
      void initRealtime();
      // Alerts are per-account: keep this login's, drop anyone else's (their
      // bodies carry message excerpts), and repaint the app-icon count.
      initAlerts();
      // Warm the whole sound bank once boot traffic has settled, so the
      // first spin/pull/deal anywhere plays the real file, not the fallback.
      setTimeout(preloadAllSfx, 1500);
      // Devices that opted into notifications also carry a push subscription
      // for closed-app pings — re-register it for whoever just signed in
      // (the endpoint upsert re-binds a shared device to the current user).
      if (notify.enabled) void setupPush();
    } else if (wasSignedIn) {
      disconnectChat();
      resetDm();
      resetNpcVoice();
      resetAffinity();
      resetTrades();
      resetAuctions();
      resetBlackjack();
      resetRoulette();
      resetCraps();
      resetHoldem();
      resetDerby();
      resetLottery();
      resetBlocks();
      resetStatus();
      resetChess();
      resetEmporium();
      resetVip();
      resetPandora();
      resetAbyss();
      resetPortal();
      resetVoice();
      resetWallet();
      resetBoard();
      resetLender();
      resetFeedback();
      resetPit();
      resetEvents();
      resetSidebets();
      resetWheel();
      resetEmoji();
      resetGraveyard();
      resetNav();
    }
  });

  // THE THEME BACKGROUND SHOWS IN CHAT AND DIRECT MESSAGES — NOWHERE ELSE
  // (Josh, Sep 2026, after two rounds of narrowing: "i only want the theme
  // background to show in the solace chat or direct messages not anything
  // else"). The `.casino` class on <html> is what the theme-atmosphere +
  // materials CSS keys off to stand down; the name predates this rule (it
  // used to mean "this view supplies its own scenery" and listed the views
  // one by one, which is how the admin panel, the manual and Feedback kept
  // taking the weather). It is now an ALLOW-list of two: everything else —
  // every casino/market/graveyard/leaderboards/backrooms/profile/admin/
  // manual/feedback view, AND the signed-out Login screen — gets palette
  // tokens only.
  //
  // NO EXCEPTIONS — not even a live theme try-on. The first cut let a
  // 20-second preview pause the kill so the Emporium (in the Market) could
  // show the full look; Josh's screenshot of Frutiger's bubbles over the
  // casino hub ("now it's even worse") ended that. A try-on previews the
  // palette everywhere and the scenery only where scenery is allowed.
  $effect(() => {
    const allowed = session.user != null && (nav.view === "chat" || nav.view === "dms");
    document.documentElement.classList.toggle("casino", !allowed);
  });

  // Countdown for the theme-preview pill (coarse 1s tick while active).
  let previewLeft = $state(0);
  $effect(() => {
    if (!themePreview.active) return;
    previewLeft = Math.ceil((themePreview.until - Date.now()) / 1000);
    const t = setInterval(() => {
      previewLeft = Math.max(0, Math.ceil((themePreview.until - Date.now()) / 1000));
    }, 1000);
    return () => clearInterval(t);
  });
  const previewName = $derived(THEMES.find((t) => t.id === themePreview.active)?.name ?? "");

  // ---- user keybinds (Settings → Voice & Controls; stored in prefs) ----
  // `key` is guaranteed a string on a real KeyboardEvent, but this runs on
  // EVERY keydown the window sees, including synthetic ones the page never
  // made — a password manager or accessibility tool filling a field can
  // dispatch a bare Event("keydown"), and then `e.key` is undefined. That
  // threw here, which aborts the rest of that dispatch and lands in the
  // client error table. Never observed in production; caught by a harness
  // dispatching exactly that shape. A missing key is simply not a combo.
  function comboOf(e: KeyboardEvent): string {
    const key = typeof e.key === "string" ? e.key : "";
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    if (key && !["Control", "Alt", "Shift", "Meta"].includes(key)) {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
    }
    return parts.join("+");
  }

  // Hold binds (push-to-talk / push-to-mute) engage on keydown and release on
  // keyup of the bind's MAIN key (modifier state is ignored on release so a
  // dropped modifier can't leave the mic stuck). engagedHolds: action → main key.
  const HOLD_ACTIONS = new Set(["pushToTalk", "pushToMute"]);
  // Each engaged hold remembers the PHYSICAL key too (Oct 2026 review): a bind
  // whose character depends on Shift or Option ("Shift+!", "Alt+†") released
  // the modifier first, the keyup then said "1" or "t", nothing matched, and
  // the mic stayed open.
  const engagedHolds = new Map<string, { key: string; code: string }>();

  function mainKeyOf(combo: string): string {
    const parts = combo.split("+");
    return parts[parts.length - 1] ?? "";
  }

  function runHold(action: string, down: boolean) {
    if (voice.channelId == null) return;
    if (action === "pushToTalk") holdTalk(down);
    else if (action === "pushToMute") holdMute(down);
  }

  function isTypingTarget(): boolean {
    const el = document.activeElement;
    return (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLElement && el.isContentEditable)
    );
  }

  function onGlobalKeydown(e: KeyboardEvent) {
    if (!session.user) return;
    const combo = comboOf(e);
    const hit = Object.entries(prefs.keybinds).find(([, c]) => c === combo)?.[0];

    // Hold binds work even while typing (you talk while you type) — but only
    // steal the keystroke outside of inputs.
    if (hit && HOLD_ACTIONS.has(hit)) {
      if (!isTypingTarget()) e.preventDefault();
      if (!e.repeat && !engagedHolds.has(hit)) {
        engagedHolds.set(hit, { key: mainKeyOf(prefs.keybinds[hit]), code: e.code ?? "" });
        runHold(hit, true);
      }
      return;
    }

    if (isTypingTarget()) return; // never steal keys from typing
    if (!hit) return;
    e.preventDefault();
    if (hit === "mute" && voice.channelId != null) void toggleMute();
    else if (hit === "deafen" && voice.channelId != null) void toggleDeafen();
    else if (hit === "search") {
      go("chat");
      ui.searchOpen = true;
    } else if (hit === "goChat") go("chat");
    else if (hit === "goDms") go("dms");
    else if (hit === "goRumble") openRumble("hub");
  }

  function onGlobalKeyup(e: KeyboardEvent) {
    if (engagedHolds.size === 0) return;
    const key = e.key ?? ""; // synthetic events arrive with no key (see comboOf)
    if (!key && !e.code) return;
    const released = key.length === 1 ? key.toUpperCase() : key;
    for (const [action, held] of engagedHolds) {
      if ((key && held.key === released) || (!!held.code && held.code === e.code)) {
        engagedHolds.delete(action);
        runHold(action, false);
      }
    }
  }

  // Alt-tab / window blur mid-hold must never leave the mic stuck open.
  function releaseAllHolds() {
    for (const action of engagedHolds.keys()) runHold(action, false);
    engagedHolds.clear();
  }

  const dmUnread = $derived(dm.conversations.reduce((n, c) => n + c.unread, 0));
  const tradeCount = $derived(trade.incoming.length);
  const chatUnread = $derived(Object.values(chat.unread).reduce((n, c) => n + c, 0));
  // Persistent alert dots (see lib/alerts.svelte.ts): unlike an unread count,
  // these survive reloads and only clear when the surface is actually opened.
  const mentionDots = $derived(alertCount("mention"));
  const dmDots = $derived(alertCount("dm"));
  // SOLACE SURVIVORZ on the rail: a red dot while a run is on air (one light request a minute)
  let survivorzLive = $state(false);
  $effect(() => {
    if (!session.user || termsDue) { survivorzLive = false; return; }
    const check = (): void => { void import("./lib/api").then(({ api }) => api.survivorzOnAir()).then((r) => (survivorzLive = r.onAir)).catch(() => {}); };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  });
</script>

<svelte:window onkeydown={onGlobalKeydown} onkeyup={onGlobalKeyup} onblur={releaseAllHolds} />

{#if session.loading}
  <p class="center">Loading…</p>
{:else if session.wake}
  <!-- Dead, but the grave is still fresh. This is not a signed-in state: the
       token behind it opens two routes and nothing else, so the app itself
       must not mount. See src/mortality.ts. -->
  <Wake />
{:else if session.cell}
  <!-- Held by the goblins. Same rule as the wake above: not a signed-in
       state, the token opens ONE route, so the app must not mount. The way
       out is somebody else paying, so the screen polls. See src/lender.ts. -->
  <Cell />
{:else if !session.user}
  <Login />
{:else if termsDue}
  <!-- THE PAPERWORK: an account that hasn't accepted the current Terms
       meets the gate INSTEAD of the app (a member from before the documents
       existed, a version bump, an API-registered account). Sterling never
       signs anything. The way out is Agree or Sign out. -->
  <TermsGate version={termsCurrent ?? 0} />
{:else}
  {@const me = session.user}
  <div class="shell" class:phone={phone.on} class:typing={phone.typing}>
    <!-- PHONE MODE: a titled top bar with a way back for the views that have
         no tab of their own (profile, feedback, the guide). -->
    {#if phone.on && PHONE_TITLES[nav.view]}
      <header class="phone-top">
        <button class="pt-back" onclick={() => go("chat")}>‹ Back</button>
        <span class="pt-title">{PHONE_TITLES[nav.view]}</span>
      </header>
    {/if}
    <nav class="rail">
      <div class="brand">Solace</div>

      <!-- THE RAIL, IN THREE CATEGORIES (Josh, Sep 2026: "organize the solace
           sections on the left for better visibility"): CHAT is where you
           talk, THE HUB is everything the house runs, SOLACE is the app
           itself. Every icon is a RailIcon — flat SVG built from the
           section's own signature, so the rail reads at a glance. -->
      <div class="items">
        <div class="cat">Chat</div>
        <!-- SOLACE PAGES. Clicking it always opens the page list; picking a
             page from there drops you into its channels. Already looking at
             the list? Then it's a way back into the page you were in. -->
        <button
          class="item"
          class:active={nav.view === "chat"}
          onclick={() => {
            if (nav.view === "chat") pages.browsing = !pages.browsing;
            else {
              pages.browsing = true;
              go("chat");
            }
          }}
        >
          <span class="ico" style="--tile: {RAIL_TILES.pages}"><RailIcon section="pages" />{#if mentionDots > 0}<span class="pip" title="You were mentioned"></span>{/if}</span>
          <span class="txt"><span class="label">Solace Pages</span><span class="sub">Communities &amp; channels</span></span>
          {#if chatUnread > 0}<span class="badge-count">{chatUnread > 99 ? "99+" : chatUnread}</span>{/if}
        </button>
        <button class="item" class:active={nav.view === "dms"} onclick={() => go("dms")}>
          <span class="ico" style="--tile: {RAIL_TILES.dms}"><RailIcon section="dms" />{#if dmDots > 0}<span class="pip" title="Unseen direct message"></span>{/if}</span>
          <span class="txt"><span class="label">Direct Messages</span><span class="sub">Private conversations</span></span>
          {#if dmUnread > 0}<span class="badge-count">{dmUnread > 99 ? "99+" : dmUnread}</span>{/if}
        </button>

        <div class="cat">The Hub</div>
        <button class="item" class:active={nav.view === "rumble"} onclick={() => openRumble("hub")}>
          <span class="ico" style="--tile: {RAIL_TILES.casino}"><RailIcon section="casino" /></span>
          <span class="txt"><span class="label">Casino</span><span class="sub">The games floor</span></span>
        </button>
        <button class="item" class:active={nav.view === "backrooms"} onclick={() => go("backrooms")}>
          <span class="ico" style="--tile: {RAIL_TILES.backrooms}"><RailIcon section="backrooms" /></span>
          <span class="txt"><span class="label">Backrooms</span><span class="sub">Don't no-clip alone</span></span>
        </button>
        <button class="item" class:active={nav.view === "survivorz"} onclick={() => go("survivorz")}>
          <span class="ico" style="--tile: {RAIL_TILES.survivorz}"><RailIcon section="survivorz" />{#if survivorzLive}<span class="pip live" title="On air now"></span>{/if}</span>
          <span class="txt"><span class="label">Survivorz</span><span class="sub">{survivorzLive ? "On air now" : "The zombie show"}</span></span>
        </button>
        <button class="item" class:active={nav.view === "graveyard"} onclick={() => go("graveyard")}>
          <span class="ico" style="--tile: {RAIL_TILES.graveyard}"><RailIcon section="graveyard" /></span>
          <span class="txt"><span class="label">Graveyard</span><span class="sub">Remember the fallen</span></span>
        </button>
        <button class="item" class:active={nav.view === "leaderboards"} onclick={() => go("leaderboards")}>
          <span class="ico" style="--tile: {RAIL_TILES.leaderboards}"><RailIcon section="leaderboards" /></span>
          <span class="txt"><span class="label">Leaderboards</span><span class="sub">Stats &amp; standings</span></span>
        </button>
        <button class="item" class:active={nav.view === "market"} onclick={() => openMarket("shop")}>
          <span class="ico" style="--tile: {RAIL_TILES.market}"><RailIcon section="market" /></span>
          <span class="txt"><span class="label">Market</span><span class="sub">Sterling · Trade · Auction</span></span>
          {#if tradeCount > 0}<span class="badge-count">{tradeCount > 99 ? "99+" : tradeCount}</span>{/if}
        </button>
        <button class="item" class:active={nav.view === "pandora"} onclick={() => go("pandora")}>
          <span class="ico" style="--tile: {RAIL_TILES.pandora}"><RailIcon section="pandora" /></span>
          <span class="txt"><span class="label">Pandora's Box</span><span class="sub">Three keys, one lid</span></span>
        </button>
        {#if abyss.opened}
          <!-- THE PORTAL: only for those who have said the stone's phrase (lib/abyss.svelte.ts) -->
          <button class="item" class:active={nav.view === "portal"} onclick={() => go("portal")}>
            <span class="ico" style="--tile: {RAIL_TILES.portal}"><RailIcon section="portal" /></span>
            <span class="txt"><span class="label">The Portal</span><span class="sub">Oveth naa'ir</span></span>
          </button>
        {/if}

        <div class="cat">Solace</div>
        <button class="item" class:active={nav.view === "feedback"} onclick={() => go("feedback")}>
          <span class="ico" style="--tile: {RAIL_TILES.feedback}"><RailIcon section="feedback" /></span>
          <span class="txt"><span class="label">Feedback</span><span class="sub">Bugs &amp; suggestions</span></span>
        </button>
        <button class="item" class:active={nav.view === "howto"} onclick={() => go("howto")}>
          <span class="ico" style="--tile: {RAIL_TILES.howto}"><RailIcon section="howto" /></span>
          <span class="txt"><span class="label">How To Guide</span><span class="sub">Every feature, explained</span></span>
        </button>
        {#if session.user?.isAdmin || session.user?.role === "moderator"}
          <button class="item" class:active={nav.view === "adminpanel"} onclick={() => go("adminpanel")}>
            <span class="ico" style="--tile: {RAIL_TILES.admin}"><RailIcon section="admin" /></span>
            <span class="txt">
              <span class="label">Admin Panel</span>
              <span class="sub">{session.user?.isAdmin ? "The house's controls" : "Moderator tools"}</span>
            </span>
          </button>
        {/if}
      </div>

      <div class="spacer"></div>

      <!-- On a phone the rail is gone from the DOM's layout, so the voice dock
           mounts OUTSIDE it (below) — display:none on the rail would hide a
           fixed-position child too. -->
      {#if !phone.on}
        <VoiceControls />
      {/if}

      <!-- NO IN-APP ALERT LEDGER. Josh asked for Discord-style behaviour and
           meant it literally: notifications belong OUTSIDE the app, raised by
           the OS when the window is not focused (lib/notify.svelte.ts). A
           bell with a list inside the app is the opposite of that — it only
           tells you things once you are already looking at Solace. The
           per-view unread pips stay; the ledger button is gone. -->

      <button class="item subtle" onclick={() => (showSettings = true)}>
        <span class="ico">⚙️</span>
        <span class="txt"><span class="label">Settings</span></span>
      </button>

      <div class="userbar">
        <!-- Discord-style: the whole pill opens the status popout; the name
             stacks over a small status line so nothing gets squeezed. -->
        <button
          class="me"
          class:active={statusMenuOpen}
          onclick={() => (statusMenuOpen = !statusMenuOpen)}
          title="Status & profile"
        >
          <span class="ava">
            <Avatar name={me.displayName} id={me.id} avatar={me.avatar} size={30} />
            <span class="dot st-{myStatus}" title={STATUS_LABEL[myStatus]}></span>
          </span>
          <span class="who">
            <span class="dname">{me.displayName}</span>
            <span class="ustatus st-{myStatus}">{STATUS_LABEL[myStatus]}</span>
          </span>
        </button>
        <button class="logout" onclick={logout} title="Log out">⏻</button>
        {#if statusMenuOpen}
          <div class="status-menu">
            {#each STATUS_OPTIONS as o (o.id)}
              <button
                class="status-opt"
                class:sel={status.manual === o.id}
                onclick={() => { setManualStatus(o.id); statusMenuOpen = false; }}
              >
                <span class="mdot st-{o.id}"></span>
                <span class="mtxt"><b>{o.name}</b><small>{o.hint}</small></span>
              </button>
            {/each}
            <div class="menu-sep"></div>
            <button class="status-opt" onclick={() => { statusMenuOpen = false; openProfile(null); }}>
              <span class="mdot profile-ico">👤</span>
              <span class="mtxt"><b>View profile</b></span>
            </button>
          </div>
        {/if}
      </div>
    </nav>

    <main class="view">
      <!-- The casino, the manual, and the admin console are code-split: chat
           boots without them, and each chunk loads on first visit (then sits
           in the immutable browser cache until the next deploy). -->
      {#if nav.view === "chat"}
        <Chat />
      {:else if nav.view === "dms"}
        <DirectMessages />
      {:else if nav.view === "rumble"}
        <Lazy load={() => import("./components/Rumble.svelte")} />
      {:else if nav.view === "market"}
        <Lazy load={() => import("./components/Market.svelte")} />
      {:else if nav.view === "survivorz"}
        <Lazy load={() => import("./components/SurvivorzView.svelte")} />
      {:else if nav.view === "graveyard"}
        <Lazy load={() => import("./components/Graveyard.svelte")} />
      {:else if nav.view === "leaderboards"}
        <Lazy load={() => import("./components/Ledger.svelte")} />
      {:else if nav.view === "pandora"}
        <Lazy load={() => import("./components/PandoraBox.svelte")} />
      {:else if nav.view === "portal"}
        <Lazy load={() => import("./components/Portal.svelte")} />
      {:else if nav.view === "backrooms"}
        <Lazy load={() => import("./components/Backrooms.svelte")} />
      {:else if nav.view === "feedback"}
        <Feedback />
      {:else if nav.view === "howto"}
        <Lazy load={() => import("./components/HowTo.svelte")} />
      {:else if nav.view === "adminpanel"}
        <Lazy load={() => import("./components/AdminPanel.svelte")} />
      {:else if nav.view === "profile"}
        <Profile />
      {/if}
    </main>

    <!-- PHONE MODE: the bottom tab bar. Three tabs — Pages, Messages, You.
         The games are not here on purpose (Josh, Sep 2026: "hide the games,
         and just focus on the chat functionality"). Steps out of the way
         while a text field has focus (.typing) so the keyboard sits directly
         under the composer. -->
    {#if phone.on}
      <VoiceControls />
      <nav class="tabbar" aria-label="Sections">
        <button
          class="tabbtn"
          class:on={nav.view === "chat" || nav.view === "profile" || nav.view === "feedback" || nav.view === "howto"}
          onclick={() => {
            youSheet = false;
            if (nav.view === "chat") pages.browsing = !pages.browsing;
            else { pages.browsing = true; go("chat"); }
          }}
        >
          <span class="tb-ico">💬{#if mentionDots > 0}<span class="pip"></span>{/if}{#if chatUnread > 0}<span class="tb-count">{chatUnread > 99 ? "99+" : chatUnread}</span>{/if}</span>
          <span class="tb-txt">Pages</span>
        </button>
        <button class="tabbtn" class:on={nav.view === "dms"} onclick={() => { youSheet = false; go("dms"); }}>
          <span class="tb-ico">✉️{#if dmDots > 0}<span class="pip"></span>{/if}{#if dmUnread > 0}<span class="tb-count">{dmUnread > 99 ? "99+" : dmUnread}</span>{/if}</span>
          <span class="tb-txt">Messages</span>
        </button>
        <!-- THE PLAY LOOP gets its own two tabs (Josh, Sep 2026). Casino and
             Market are one tap each because they are the daily round trip:
             win emoji at the Wheel, sell them at the Trader, bet the silver.
             Leaderboards and the Admin Panel are destinations you visit, not
             loops you run, so they live in the You sheet rather than
             squeezing a 360px bar to six columns. -->
        <button class="tabbtn" class:on={nav.view === "rumble"} onclick={() => { youSheet = false; openRumble("hub"); }}>
          <span class="tb-ico">🎰</span>
          <span class="tb-txt">Casino</span>
        </button>
        <button class="tabbtn" class:on={nav.view === "market"} onclick={() => { youSheet = false; openMarket("shop"); }}>
          <span class="tb-ico">🪙{#if tradeCount > 0}<span class="tb-count">{tradeCount > 99 ? "99+" : tradeCount}</span>{/if}</span>
          <span class="tb-txt">Market</span>
        </button>
        <button class="tabbtn" class:on={youSheet} onclick={() => (youSheet = !youSheet)}>
          <span class="tb-ico tb-ava">
            <Avatar name={me.displayName} id={me.id} avatar={me.avatar} size={26} />
            <span class="dot st-{myStatus}"></span>
          </span>
          <span class="tb-txt">You</span>
        </button>
      </nav>
    {/if}

    {#if phone.on && youSheet}
      <div class="sheet-scrim" onclick={() => (youSheet = false)} role="presentation"></div>
      <div class="you-sheet" role="dialog" aria-label="You">
        <div class="ys-grip"></div>
        <div class="ys-me">
          <Avatar name={me.displayName} id={me.id} avatar={me.avatar} size={44} />
          <div class="ys-who">
            <span class="ys-name">{me.displayName}</span>
            <span class="ys-handle">@{me.username}</span>
          </div>
        </div>
        <div class="ys-status">
          {#each STATUS_OPTIONS as o (o.id)}
            <button class="ys-st" class:sel={status.manual === o.id} onclick={() => setManualStatus(o.id)}>
              <span class="mdot st-{o.id}"></span>{o.name}
            </button>
          {/each}
        </div>
        <div class="ys-list">
          <button class="ys-row" onclick={() => { youSheet = false; openProfile(null); }}><span>👤</span>View profile</button>
          <button class="ys-row" onclick={() => { youSheet = false; go("leaderboards"); }}><span>🏆</span>Leaderboards</button>
          <!-- PANDORA AND THE PORTAL LIVE ONLY ON THE RAIL, and the rail is
               gone on a phone. They were in PHONE_VIEWS — so the bounce
               effect let them stand — but nothing anywhere could navigate to
               them: the endgame was permitted and unreachable at the same
               time. These two rows are the door. The Portal keeps the rail's
               own gate (it exists only for whoever has said the phrase). -->
          <button class="ys-row" onclick={() => { youSheet = false; go("pandora"); }}><span>🗝️</span>Pandora's Box</button>
          {#if abyss.opened}
            <button class="ys-row" onclick={() => { youSheet = false; go("portal"); }}><span>🌀</span>The Portal</button>
          {/if}
          {#if phoneAllows("adminpanel", me)}
            <button class="ys-row" onclick={() => { youSheet = false; go("adminpanel"); }}><span>🛠️</span>Admin Panel</button>
          {/if}
          <button class="ys-row" onclick={() => { youSheet = false; showSettings = true; }}><span>⚙️</span>Settings</button>
          <button class="ys-row" onclick={() => { youSheet = false; go("howto"); }}><span>📖</span>How To Guide</button>
          <button class="ys-row" onclick={() => { youSheet = false; go("feedback"); }}><span>📮</span>Feedback</button>
          <button class="ys-row out" onclick={() => { youSheet = false; void logout(); }}><span>⏻</span>Sign out</button>
        </div>
        <p class="ys-note">The Backrooms, the Escape Room and the casino floor in first person need a desktop — they're played with a mouse and a keyboard.</p>
      </div>
    {/if}
  </div>

  <!-- Live cameras/screens from my voice room — survives view changes. -->
  <VideoStage />

  {#if appUpdate.available}
    <button class="update-pill" onclick={applyUpdate}>
      ✨ Solace updated — tap to reload
    </button>
  {/if}

  <!-- TOO MANY TABS (Sep 2026 review): the server caps sockets per account and
       closes the oldest. This tab is that one; it does not reconnect on its
       own (it would evict the next, which would reconnect…). One click. -->
  {#if chat.evicted}
    <button class="update-pill evicted" onclick={reclaimSocket}>
      🪟 Solace is open in too many tabs — this one went quiet · Take over here
    </button>
  {/if}

  <!-- ACHIEVEMENT TOASTS: your own unlocks, bottom-right, self-dismissing.
       Sterling handles the public bragging for gold+ in #general. -->
  {#if achToasts.list.length}
    <div class="ach-toasts">
      {#each achToasts.list as t (t.key)}
        <div class="ach-toast tier-{t.tier}">
          <span class="at-medal">{t.tier === "mythic" ? "👑" : t.tier === "gold" ? "🥇" : t.tier === "silver" ? "🥈" : "🥉"}</span>
          <div class="at-body">
            <div class="at-kicker">ACHIEVEMENT EARNED</div>
            <div class="at-name">{t.name}</div>
            <div class="at-desc">{t.desc}</div>
            {#if t.rewardItem}<div class="at-reward">🎁 exclusive cosmetic unlocked — see Settings</div>{/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- HOUSE NOTICES (Sep 2026): the collectors' visit, a friend paying the
       goblins for you, your bail clearing. Same corner as the badges. -->
  {#if notices.list.length}
    <div class="notice-stack" class:with-ach={achToasts.list.length > 0}>
      {#each notices.list as n (n.key)}
        <button class="notice tone-{n.tone}" onclick={() => dismissNotice(n.key)} title="dismiss">
          <span class="no-icon">{n.icon}</span>
          <span class="no-body">
            <span class="no-title">{n.title}</span>
            <span class="no-text">{n.body}</span>
          </span>
        </button>
      {/each}
    </div>
  {/if}

  {#if themePreview.active}
    <div class="preview-pill">
      <span class="pv-label">👁 Trying on <b>{previewName}</b> · {previewLeft}s</span>
      <button class="pv-btn buy" onclick={() => { showSettings = false; openMarket("shop"); }}>To Sterling's</button>
      <button class="pv-btn" onclick={endThemePreview}>End</button>
    </div>
  {/if}

  {#if showSettings}
    <Settings onClose={() => (showSettings = false)} />
  {/if}

  <!-- Existing accounts with no recovery secret must set one before using the
       app. Gates everything behind it (z-index above the shell + Settings). -->
  {#if me.hasSecret === false}
    <SetSecretGate />
  {/if}
{/if}

<!-- THE HOUSE CONFIRM — one dialog for the whole app, outside the signed-in
     block so the sign-in screens can reach it too. Browser confirm() is banned
     here (Josh, Aug 2026); see lib/confirm.svelte.ts. -->
<ConfirmDialog />
<AbyssStone />

<style>
  .center {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    color: var(--ink-soft);
  }
  .shell {
    display: grid;
    /* 248, not 210 (Josh, Sep 2026: "fix whatever is left"). At 210 the two
       top rail rows truncated their own labels — "Direct Messages" rendered
       as "Direct M…" — and NOT only on small screens: the rail is a fixed
       column, so it did it at 1440px too. The cause is the unread badge,
       which takes its width out of the label's share, so the rows that
       truncated were exactly the two that carry counts. 248 is what "Direct
       Messages" (112px) and "Communities & channels" (120px) need alongside
       a 38px tile, the gaps and a "99+" badge. Only screens above the 820px
       collapse point ever see this width, and they have the room. */
    grid-template-columns: 248px 1fr;
    height: 100dvh;
    /* Notched phones (viewport-fit=cover): keep the rail + composer clear of
       the home indicator and rounded corners. Zero everywhere else. */
    box-sizing: border-box;
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .rail {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 10px 12px;
    background: var(--panel);
    border-right: 1px solid var(--line);
    min-height: 0;
  }
  .brand {
    font-weight: 800;
    font-size: 1.05rem;
    letter-spacing: 0.02em;
    color: var(--ink);
    padding: 8px 10px 12px;
  }
  .items {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  /* The three category captions. Small, spaced, dim: a grouping, not a row. */
  .cat {
    padding: 11px 10px 4px;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-dim);
    user-select: none;
  }
  .cat:first-child {
    padding-top: 2px;
  }
  .item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 9px;
    background: none;
    border: none;
    border-radius: 10px;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.95rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }
  /* THE TINTED TILES. Each section owns a hue (RAIL_TILES, poured in as
     --tile) and the glyph on it is cream, so the rail reads as ten coloured
     stamps rather than ten dark squares. At rest the tile is dimmed toward
     the panel so the column stays calm; hover and the active row bring it
     to full colour with a soft glow of its own hue. */
  .item .ico {
    --tile: var(--accent);
    font-size: 1.1rem;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    flex: none;
    border-radius: 11px;
    background: linear-gradient(
      155deg,
      color-mix(in srgb, var(--tile) 62%, var(--panel-2)) 0%,
      color-mix(in srgb, var(--tile) 42%, #0a0806) 100%
    );
    border: 1px solid color-mix(in srgb, var(--tile) 34%, var(--line));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.16),
      inset 0 -1px 0 rgba(0, 0, 0, 0.25),
      0 1px 2px rgba(0, 0, 0, 0.35);
    transition:
      transform 0.14s ease,
      border-color 0.14s ease,
      background 0.14s ease,
      box-shadow 0.14s ease;
  }
  .item:hover .ico {
    transform: translateY(-1px);
    background: linear-gradient(
      155deg,
      color-mix(in srgb, var(--tile) 92%, #fff) 0%,
      color-mix(in srgb, var(--tile) 74%, #0a0806) 100%
    );
    border-color: color-mix(in srgb, var(--tile) 70%, #fff);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.28),
      inset 0 -1px 0 rgba(0, 0, 0, 0.25),
      0 3px 10px color-mix(in srgb, var(--tile) 40%, transparent);
  }
  .item:hover .ico :global(.railicon) {
    transform: scale(1.08);
  }
  .item .ico :global(.railicon) {
    width: 26px;
    height: 26px;
    transition: transform 0.14s ease;
  }
  .item.active .ico {
    background: linear-gradient(
      155deg,
      color-mix(in srgb, var(--tile) 96%, #fff) 0%,
      color-mix(in srgb, var(--tile) 78%, #0a0806) 100%
    );
    border-color: color-mix(in srgb, var(--tile) 60%, #fff);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.3),
      inset 0 -1px 0 rgba(0, 0, 0, 0.25),
      0 0 0 1px color-mix(in srgb, var(--tile) 30%, transparent),
      0 3px 12px color-mix(in srgb, var(--tile) 45%, transparent);
  }
  .item .txt {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    line-height: 1.15;
  }
  .item .label {
    font-size: 0.92rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item .sub {
    font-size: 0.68rem;
    font-weight: 500;
    color: var(--ink-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge-count {
    margin-left: auto;
    flex: none;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1;
  }
  /* The persistent alert pip: a red dot on the icon tile that outlives the
     notification itself and only clears when the surface is opened. */
  .item .ico {
    position: relative;
  }
  .pip.live { background: #ff3b30; animation: pip-live 1.6s ease-in-out infinite; }
  @keyframes pip-live { 50% { opacity: 0.45; } }
  .pip {
    position: absolute;
    top: -1px;
    right: -2px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #e0563c;
    box-shadow: 0 0 0 2px var(--panel);
  }
  .item:hover {
    background: var(--panel-2);
    color: var(--ink);
  }
  .item.active {
    background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 17%, transparent), transparent 82%);
    color: var(--ink);
  }
  .item.active .sub {
    color: var(--ink-soft);
  }
  .item.active::before {
    content: "";
    position: absolute;
    left: -10px;
    top: 20%;
    bottom: 20%;
    width: 3px;
    border-radius: 3px;
    background: var(--accent);
  }
  .item.subtle {
    color: var(--ink-dim);
    font-weight: 500;
  }
  .item.subtle:hover {
    color: var(--ink);
  }
  .spacer {
    flex: 1;
  }
  .userbar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .me {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    padding: 6px 8px;
    background: none;
    border: none;
    border-radius: 9px;
    cursor: pointer;
    text-align: left;
  }
  .me:hover,
  .me.active {
    background: var(--panel-2);
  }
  .ava {
    position: relative;
    display: inline-flex;
    flex: none;
  }
  .dot {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--ok);
    border: 2px solid var(--panel);
  }
  .dot.st-away { background: #e0a83c; }
  .dot.st-busy { background: var(--danger); }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
    text-align: left;
  }
  .dname {
    min-width: 0;
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ustatus {
    font-size: 0.68rem;
    color: var(--ok);
  }
  .ustatus.st-away { color: #e0a83c; }
  .ustatus.st-busy { color: var(--danger); }
  .status-menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + 8px);
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 230px;
    padding: 6px;
    background: var(--panel);
    border: 1px solid var(--line-2);
    border-radius: 12px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.5);
  }
  .status-opt {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    background: none;
    border: none;
    border-radius: 8px;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .status-opt:hover { background: var(--panel-2); }
  .status-opt.sel { outline: 1px solid var(--accent); }
  .mdot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--ok);
  }
  .mdot.st-away { background: #e0a83c; }
  .mdot.st-busy { background: var(--danger); }
  .mtxt {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .mtxt b { font-size: 0.82rem; }
  .mtxt small { font-size: 0.68rem; color: var(--ink-dim); }
  .menu-sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--line);
  }
  .mdot.profile-ico {
    width: auto;
    height: auto;
    background: none;
    font-size: 0.85rem;
  }
  .logout {
    flex: none;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    background: none;
    border: none;
    border-radius: 8px;
    color: var(--ink-soft);
    font-size: 1rem;
    cursor: pointer;
  }
  .logout:hover {
    background: var(--panel-2);
    color: var(--danger);
  }
  .view {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .ach-toasts {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 340px;
  }
  .ach-toast {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--panel, #1c1a17);
    border: 1px solid var(--line, #3a362f);
    border-left: 4px solid #b0793f;
    box-shadow: 0 8px 26px rgba(0, 0, 0, 0.45);
    animation: ach-in 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  .ach-toast.tier-silver { border-left-color: #b9c2cc; }
  .ach-toast.tier-gold { border-left-color: #e8c34a; }
  .ach-toast.tier-mythic { border-left-color: #ff5db1; }
  @keyframes ach-in {
    from { transform: translateY(14px); opacity: 0; }
    to { transform: none; opacity: 1; }
  }
  /* House notices share the corner; they stack ABOVE the badges when both show. */
  .notice-stack {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 340px;
  }
  .notice-stack.with-ach { bottom: 120px; }
  .notice {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--panel, #1c1a17);
    border: 1px solid var(--line, #3a362f);
    border-left: 4px solid #8a7434;
    box-shadow: 0 8px 26px rgba(0, 0, 0, 0.45);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    animation: ach-in 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  .notice.tone-grim { border-left-color: #b8412e; }
  .notice.tone-kind { border-left-color: #6fae4a; }
  .no-icon { font-size: 1.4rem; line-height: 1; }
  .no-body { display: flex; flex-direction: column; gap: 2px; }
  .no-title { font-size: 0.66rem; font-weight: 800; letter-spacing: 0.16em; color: var(--ink-soft); }
  .no-text { font-size: 0.86rem; line-height: 1.35; }
  .at-medal { font-size: 1.5rem; line-height: 1; }
  .at-kicker {
    font-size: 0.6rem;
    letter-spacing: 0.16em;
    color: var(--ink-soft);
  }
  .at-name { font-weight: 800; font-size: 0.95rem; }
  .at-desc { font-size: 0.75rem; color: var(--ink-soft); margin-top: 1px; }
  .at-reward { font-size: 0.72rem; margin-top: 4px; color: #e8c34a; }

  .update-pill {
    position: fixed;
    top: calc(10px + env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    padding: 8px 18px;
    border: none;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
    animation: pill-in 0.25s ease;
  }
  /* --text and --border are NOT house tokens (the names are --ink and
     --line), and an unresolvable var makes its whole declaration invalid at
     computed-value time: the colour fell back to INHERITED rather than to the
     base rule's, and the border shorthand fell all the way back to
     `medium none`, so this pill has been drawing with no border at all. The
     same silent failure the exchange's volume bars made visible. */
  .update-pill.evicted {
    background: var(--panel-2, var(--panel));
    color: var(--ink);
    border: 1px solid var(--line);
  }
  .update-pill:hover {
    filter: brightness(1.08);
  }
  @keyframes pill-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  .preview-pill {
    position: fixed;
    top: calc(10px + env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px 7px 16px;
    border: 1px solid var(--line-2);
    border-radius: 999px;
    background: var(--panel);
    color: var(--ink);
    font-size: 0.82rem;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
    animation: pill-in 0.25s ease;
    max-width: calc(100vw - 20px);
    white-space: nowrap;
  }
  .pv-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pv-btn {
    flex: none;
    padding: 4px 12px;
    border: 1px solid var(--line-2);
    border-radius: 999px;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }
  .pv-btn:hover {
    border-color: var(--accent);
  }
  .pv-btn.buy {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  .pv-btn.buy:hover {
    filter: brightness(1.08);
  }

  /* ---- PHONE MODE (≤760px, matching lib/phone.svelte.ts + the chat drawers) ----
     The rail leaves the layout entirely; the tab bar takes the bottom row. */
  .tabbar,
  .phone-top,
  .you-sheet,
  .sheet-scrim {
    display: none;
  }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .shell.phone {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr auto;
      padding-bottom: 0;
      /* The status bar / notch: one pad on the shell, so every view's own
         header (chat, DMs, the page picker) clears it without knowing. The
         drawers and full-screen sheets are fixed and pad themselves. */
      padding-top: env(safe-area-inset-top);
      background: var(--panel);
    }
    .shell.phone .view {
      background: var(--bg);
    }
    .shell.phone .rail {
      display: none;
    }
    .shell.phone .view {
      grid-row: 2;
    }
    .phone-top {
      display: flex;
      align-items: center;
      gap: 10px;
      grid-row: 1;
      min-height: 52px;
      padding: 0 12px 0 4px;
      background: var(--panel);
      border-bottom: 1px solid var(--line);
    }
    .pt-back {
      background: none;
      border: none;
      color: var(--accent);
      font: inherit;
      font-size: 1.02rem;
      font-weight: 600;
      padding: 10px 8px;
      border-radius: 10px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .pt-back:active {
      background: var(--panel-2);
    }
    .pt-title {
      font-weight: 800;
      font-size: 1.05rem;
      color: var(--ink);
    }
    .tabbar {
      display: grid;
      /* FIVE tabs since the phone opened up (Pages · Messages · Casino ·
         Market · You). Five is the ceiling, measured at a real 360px — the
         narrowest phone worth designing for: 67.67px a column, which still
         holds the 44×28 glyph tile over a readable label. A sixth would have
         to lose the labels, and an unlabelled bar is a guessing game. */
      grid-template-columns: repeat(5, 1fr);
      grid-row: 3;
      padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
      background: var(--panel);
      border-top: 1px solid var(--line);
    }
    /* Keyboard up: the tab bar steps out so the composer meets the keys. */
    .shell.phone.typing .tabbar {
      display: none;
    }
    .tabbtn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 6px 2px 4px;
      background: none;
      border: none;
      border-radius: 12px;
      color: var(--ink-dim);
      font: inherit;
      /* 0.66rem, not 0.7. Measured at 360px with Inter loaded: the column is
         67.67px, so a label gets 63.67px of content box, and "Messages" — the
         longest — draws 52px. 11.7px of headroom at the default font scale,
         still clear at 110%. Past that the pref wins and the ellipsis does its
         job (65px at 125%): somebody who asked for bigger text would rather
         read "Message…" than have every label shrunk back for them. */
      font-size: 0.66rem;
      font-weight: 600;
      letter-spacing: 0;
      min-width: 0;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
    }
    .tabbtn.on {
      color: var(--accent);
      font-weight: 700;
    }
    .tabbtn:active .tb-ico {
      transform: scale(0.94);
    }
    .tb-ico {
      position: relative;
      font-size: 1.25rem;
      line-height: 1;
      display: grid;
      place-items: center;
      width: 44px;
      max-width: 100%;
      height: 28px;
      border-radius: 999px;
      transition: transform 0.1s ease, background 0.15s ease;
    }
    .tb-txt {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tabbtn.on .tb-ico {
      background: color-mix(in srgb, var(--accent) 16%, transparent);
    }
    .tb-ava {
      font-size: 0;
    }
    .tb-ava .dot {
      position: absolute;
      right: 8px;
      bottom: 1px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      border: 2px solid var(--panel);
    }
    .tb-count {
      position: absolute;
      top: -4px;
      right: 2px;
      min-width: 17px;
      height: 17px;
      padding: 0 5px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-ink);
      font-size: 0.62rem;
      font-weight: 800;
    }
    .tb-ico .pip {
      position: absolute;
      top: 1px;
      left: 6px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--danger);
      border: 2px solid var(--panel);
    }
    /* THE "YOU" SHEET — a bottom sheet over the app. */
    .sheet-scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 90;
      background: rgba(0, 0, 0, 0.45);
    }
    .you-sheet {
      display: block;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 95;
      padding: 8px 16px calc(16px + env(safe-area-inset-bottom));
      background: var(--panel);
      border-top: 1px solid var(--line-2);
      border-radius: 18px 18px 0 0;
      box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.5);
      animation: sheet-up 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
      /* The sheet grows with what the account can reach — a staff member with
         the Portal open sees nine rows, which is 631px, and a 667px phone
         (the small iPhone) has 36px to spare. That is thin enough that the
         next row added here would push "Sign out" off the bottom with no
         way to reach it. Cap it and let it scroll instead of clipping. */
      max-height: calc(100dvh - 24px);
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    @keyframes sheet-up {
      from { transform: translateY(40px); opacity: 0; }
      to { transform: none; opacity: 1; }
    }
    .ys-grip {
      width: 40px;
      height: 4px;
      margin: 0 auto 12px;
      border-radius: 2px;
      background: var(--line-2);
    }
    .ys-me {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .ys-who {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .ys-name {
      font-weight: 800;
      font-size: 1.05rem;
      color: var(--ink);
    }
    .ys-handle {
      font-size: 0.8rem;
      color: var(--ink-dim);
    }
    .ys-status {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin-bottom: 12px;
    }
    .ys-st {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 9px 6px;
      background: var(--panel-2);
      border: 1px solid var(--line);
      border-radius: 10px;
      color: var(--ink-soft);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
    }
    .ys-st.sel {
      border-color: var(--accent);
      color: var(--ink);
    }
    .ys-list {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
    }
    .ys-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 13px 14px;
      background: var(--panel-2);
      border: none;
      border-bottom: 1px solid var(--line);
      color: var(--ink);
      font: inherit;
      font-size: 0.95rem;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }
    .ys-row:last-child {
      border-bottom: none;
    }
    .ys-row span {
      width: 22px;
      text-align: center;
    }
    .ys-row.out {
      color: var(--danger);
    }
    .ys-note {
      margin: 12px 2px 0;
      font-size: 0.74rem;
      color: var(--ink-dim);
    }
    /* Toasts and pills clear the tab bar. */
    .shell.phone ~ .ach-toasts,
    .ach-toasts,
    .notice-stack {
      bottom: calc(76px + env(safe-area-inset-bottom));
      left: 12px;
      right: 12px;
      max-width: none;
    }
    .notice-stack.with-ach {
      bottom: calc(180px + env(safe-area-inset-bottom));
    }
  }

  /* A PHONE ON ITS SIDE (Josh, Sep 2026: "landscape should get the phone
     treatment"). Phone mode itself is handled by PHONE_QUERY's second clause;
     what changes HERE is the arithmetic of a short screen. Landscape gives
     844x390 on a typical phone, and the upright tab bar costs 66px of that —
     a sixth of the height, before the 52px header and the composer. So the
     tabs lay themselves out as ROWS: the glyph beside its label instead of
     above it, which buys back about 20px. The button KEEPS the 44px floor
     (it is the app's primary navigation, and .tabbtn is exempt from the
     global rule only because it is normally much taller) — five columns of
     844px is 168px each, so the label has room to spare either way.

     The notch is on the SIDE in landscape, not the bottom, so the bar takes
     the left/right insets here; the shell already pads the rest. */
  @media (max-height: 500px) and (pointer: coarse) {
    .tabbar {
      padding: 2px calc(4px + env(safe-area-inset-right)) calc(2px + env(safe-area-inset-bottom))
        calc(4px + env(safe-area-inset-left));
    }
    .tabbtn {
      flex-direction: row;
      /* Turning the flex axis moves what `align-items: center` was doing:
         upright it centred the glyph over its label, in a row it centres them
         vertically and `justify-content` is what keeps the PAIR in the middle
         of its 167px column. Without this they hug the left edge. */
      justify-content: center;
      gap: 7px;
      padding: 4px 2px;
      font-size: 0.72rem;
      min-height: 44px;
    }
    .tb-ico {
      width: 28px;
      height: 26px;
      font-size: 1.1rem;
    }
    /* The pip rides the glyph's corner; in a row it would otherwise sit in
       the gap between glyph and label. */
    .tb-ico .pip {
      right: -1px;
    }
    /* Short screens: the titled back bar and the You sheet both give up
       vertical padding rather than content. */
    .phone-top {
      height: 40px;
    }
    .you-sheet {
      padding-top: 4px;
    }
    .ys-me {
      padding: 4px 2px;
    }
  }

  @media (max-width: 820px) {
    .shell {
      grid-template-columns: 58px 1fr;
    }
    .rail {
      padding: 10px 7px 12px;
    }
    .brand {
      display: none;
    }
    .item {
      justify-content: center;
      padding: 8px 0;
      gap: 0;
    }
    .item .txt {
      display: none;
    }
    .cat {
      display: none;
    }
    .item.active::before {
      left: -7px;
    }
    .who {
      display: none;
    }
    .userbar {
      flex-direction: column;
      gap: 6px;
    }
    .status-menu {
      left: -4px;
      bottom: calc(100% + 4px);
      width: 200px;
    }
    .me {
      justify-content: center;
    }
    .logout {
      width: 100%;
    }
  }
</style>
