<script lang="ts">
  // The house manual: every feature, in the house voice. Static content —
  // update it when features ship (CLAUDE.md gotcha: new feature = new entry).
  //
  // July 2026 rework (Josh's call): PAGED, not a scroll-and-jump wall — a
  // persistent section nav on the left, one section per page, a wider
  // reading column, and every section broken into titled topic blocks.
  const SECTIONS = [
    { id: "basics", icon: "💬", label: "The Basics" },
    { id: "wheel", icon: "🎡", label: "The Wheel & Death" },
    { id: "silver", icon: "🪙", label: "Silver & Sterling" },
    { id: "games", icon: "🎰", label: "The Casino" },
    { id: "market", icon: "🤝", label: "Trading" },
    { id: "backrooms", icon: "🚪", label: "Backrooms" },
    { id: "voice", icon: "🎙️", label: "Voice & Video" },
    { id: "apps", icon: "💻", label: "Apps & Devices" },
    { id: "account", icon: "🔑", label: "Your Account" },
  ] as const;
  type PageId = (typeof SECTIONS)[number]["id"];

  let page = $state<PageId>("basics");
  let pane = $state<HTMLElement | null>(null);

  const idx = $derived(SECTIONS.findIndex((s) => s.id === page));
  const current = $derived(SECTIONS[idx]);
  const prev = $derived(idx > 0 ? SECTIONS[idx - 1] : null);
  const next = $derived(idx < SECTIONS.length - 1 ? SECTIONS[idx + 1] : null);

  function go(id: PageId): void {
    page = id;
    pane?.scrollTo({ top: 0 });
  }
</script>

<div class="howto">
  <div class="guide">
    <aside class="nav">
      <h1>How To Guide</h1>
      <p class="tag">Everything the house offers, and how not to die using it.</p>
      {#each SECTIONS as s (s.id)}
        <button class="navbtn" class:active={page === s.id} onclick={() => go(s.id)}>
          <span class="ni">{s.icon}</span>{s.label}
        </button>
      {/each}
    </aside>

    <main class="content" bind:this={pane}>
      <h2>{current.icon} {current.label}</h2>

      {#if page === "basics"}
        <div class="block">
          <h3>Pages</h3>
          <p>A <b>page</b> is a community with its own channels. <b>Solace Pages</b> in the left rail lists them; <b>Solace General</b> is home — everyone's in it.</p>
          <p>Three doors: <b>Open</b> — walk in to join. <b>Request</b> — hit <b>request</b> on the card and a page manager lets you in (or doesn't). <b>Invite only</b> — members are added by hand. A page can also be <b>hidden</b>, invisible unless you're in it. You never see inside a page you haven't joined — only its card. A page <b>manager</b> runs that page's channels, settings, and join requests, nothing else.</p>
          <p>Click the page icon at the top of the channel list for settings; click the name to go back to the page list. A page's settings also set its <b>chat rules</b>: whether attachments and GIFs are allowed, how long images and GIFs are kept, and whether old messages are deleted after a number of days.</p>
          <p>Only the admin creates pages here. Want a page of your own? <b>Self-host</b> one — the "Want to self-host?" band at the foot of the page list has the Windows app and the one-line Ubuntu install. Your community's messages live on your machine and show up here as a page.</p>

          <h3>Channels</h3>
          <p>Anyone can create a channel; the creator runs it. Locked channels: everyone reads, only approved members post.</p>

          <h3>Roles</h3>
          <p>Page Settings → Roles. A page's managers (and admins) create <b>roles</b> — a name, a colour, and a set of permissions: send messages, attach files, post GIFs, mention @everyone, create channels, manage channels, manage members, manage roles. A member's permissions are whatever <b>@everyone</b> allows plus every role they hold, so turning something off for @everyone and handing it back through a role is how you gate a page. Roles higher in the list outrank lower ones: someone with <i>manage roles</i> can only touch roles below their own and grant what they hold. A channel can be <b>visible only to certain roles</b>, and a locked channel can name the <b>roles that may post</b> beside its allow-list. A role's colour tints the name on the roster and in chat, unless a paid flair is on.</p>

          <h3>Read receipts</h3>
          <p>Under the newest message you'll see who has read it; in a DM your last message says <b>Seen</b> once they have. Settings → Profile turns receipts off — then you neither send nor see them.</p>
        </div>
        <div class="block">
          <h3>Direct Messages</h3>
          <p>Private 1:1 conversations. Open one from anyone's profile with the Message button.</p>
        </div>
        <div class="block">
          <h3>Replies & reactions</h3>
          <p>Hover a message to reply or react — on a phone, <b>press and hold</b> it. Reactions and chat emoji are <b>collectibles</b> — you can only use emoji you own.</p>
        </div>
        <div class="block">
          <h3>Pictures & files</h3>
          <p>Paste (Ctrl+V), drag in, or hit 📎. Nothing posts until you send. Images and text files only. Files expire eventually (animated ~30 days, images ~90); messages stay.</p>
        </div>
        <div class="block">
          <h3>Emoji in chat</h3>
          <p>Type <code>:name:</code> or use the 😀 picker. One emoji alone posts jumbo-sized.</p>
        </div>
        <div class="block">
          <h3>@Mentions & notifications</h3>
          <p>Type <code>@</code> and pick a name. Turn on pings in Settings → Appearance → Notifications (per device) — they reach you even with Solace closed. Missed mentions, DMs and reminders wait as alerts on the 🔔 button until you open them.</p>
        </div>
        <div class="block">
          <h3>Reading where you left off</h3>
          <p>Channels and DMs remember your scroll position. The <b>↓ newest</b> pill jumps back down.</p>
        </div>
        <div class="block">
          <h3>The roster</h3>
          <p>Shows where people are — 🔊 in voice, 🃏 at a table, 🎲 in the Pit.</p>
        </div>
        <div class="block">
          <h3>Search & shortcuts</h3>
          <p>🔍 in the chat header searches every channel plus your own DMs. Set keyboard shortcuts in Settings → Voice.</p>
        </div>
        <div class="block">
          <h3>Leaderboards</h3>
          <p>Its own section on the left — boards for every table, the Market and the worlds, filterable by venue, with your own standing pinned at the top. Wallets stay private; it ranks deeds, never balances.</p>
        </div>
        <div class="block">
          <h3>🏅 Achievements</h3>
          <p>Badges on every profile, bronze through mythic, earned everywhere in Solace. Locked ones show progress; a few are secret. The rarest grant exclusive cosmetics. Past deeds count — badges backfill.</p>
        </div>

      {:else if page === "wheel"}
        <div class="block">
          <h3>Free spins</h3>
          <p>You get <b>7 free spins every 2 hours</b>. Spins win collectible emoji — commons, rares, legendaries — plus blanks, a mystery box, and two special slots.</p>
        </div>
        <div class="block">
          <h3>💀 The death slot is real</h3>
          <p>A dead account is terminated — it can't log back in and appears in the Graveyard.</p>
          <p><b>The reaper gets impatient.</b> Landing on the death wedge with a talisman breaks the talisman about half the time. Without one you're nearly safe at first — but every spin you take unshielded makes the next landing more dangerous, and after about 55 of them it climbs fast. The wheel shows where you stand: <b>spins of grace</b> while you have them, then a red warning with the real odds. Get a talisman and it resets.</p>
          <p>The grave stays open for <b>48 hours</b>. Anyone can revive you for <b>10,000 silver</b> or a sacrificed mythic. Or buy yourself back: it costs your whole purse plus a random third of your collection (you need at least some silver or emoji to pay).</p>
          <p>If nobody comes, the grave seals: that life becomes a Graveyard monument, your will pays out, and you restart as the next generation — keeping achievements, titles, a quarter of your silver and the rarest tenth of your collection (at least five).</p>
          <p>Or walk away: the wake screen lets you register a <b>fresh account with no invite code</b> — the grave is your invitation. The old grave stays raisable until it seals. The goblins' cell offers the same door.</p>
        </div>
        <div class="block">
          <h3>🪬 The talisman</h3>
          <p>A one-use death shield: when the death wedge fires on you it's consumed instead of you, and your grace starts over. Win it on the Wheel or mystery box, buy it from Sterling for <b>30,000 silver</b>, or trade a mythic to the Wheelwright. Worth the price when the wheel says the reaper is watching — and if your gauge goes red, Sterling sometimes writes to offer you money off it.</p>
        </div>
        <div class="block">
          <h3>📜 Your will & epitaph</h3>
          <p>Settings → Profile → Legacy. Name an heir and they inherit your silver and collection when you die; duplicates are buried with you. No will means everything is buried. Set your epitaph too — it's carved on your tombstone.</p>
        </div>
        <div class="block">
          <h3>Graveyard</h3>
          <p>The Graveyard (under THE HUB on the left) remembers the fallen. Pay respects by laying an owned emoji on a grave, <b>light a candle (25 silver, burns for a day)</b> or <b>leave flowers (100 silver — fresh a day, gone in seven)</b>. Both prices burn.</p>
          <p>Click any stone for its <b>memorial</b>: the family plot of past lives, who raised whom, and <b>eulogies</b> — write one per grave, free. Stones carved after Aug 2026 name the death: the Wheel, or the goblins.</p>
          <p>The <b>Necrology</b> at the gate keeps the morbid ledger — deaths by cause, talisman saves, silver burned raising the dead, and the days-since-last-accident sign.</p>
        </div>

      {:else if page === "silver"}
        <div class="block">
          <h3>Where silver comes from</h3>
          <p>Silver comes from exactly one place: <b>selling emoji to Sterling</b> at the Market's <b>Emojis</b> counter (common 50 · rare 200 · legendary 2,500). Mythics, talismans, and specials can't be sold — they move only between players.</p>
          <p>Switch the counter to <b>Buy</b> for <b>Sterling's shelves</b>: a fresh spread every day at midnight UTC, the same for everyone — one legendary on the top shelf (25,000), three rares in the middle (1,000), six commons at the bottom (100). One of each per customer per day. The silver you pay him burns.</p>
        </div>
        <div class="block">
          <h3>The Wheelwright</h3>
          <p>Sterling's second counter: extra Wheel spins for <b>500 silver</b>, a <b>talisman for one mythic</b> (burned), the talisman outright for <b>30,000</b>, or a random unowned <b>mythic for 500,000</b> — the only way mythics enter the world. Prices are burned; prizes can't be sold back.</p>
        </div>
        <div class="block">
          <h3>💬 Talking to the house</h3>
          <p>Three characters answer commands in any channel. Type the command on its own line and they reply where you asked.</p>
          <p><b>/sterling</b> — the house. Today's shelf, tonight's pot, the mythic price, every house edge, an appraisal, the boards, your own ledger by DM, the reaper's gauge, what a shield costs <i>you</i>, the VIP ladder, the Forge, the jukebox, and what he thinks of the other two. <b>/sterling help</b> lists it all.</p>
          <p><b>/goblins</b> — the lenders. Their rates and yours, your bill and tomorrow's, whether you're holding an offer, who's in the cells, what's on their shelf, their vault, and the small print read aloud. <b>/goblins file</b> shows what they know about you, which is more than you'd like.</p>
          <p><b>/ada</b> — Dr. Ada Voss, at Threshold-4. The manifest, what she pays for findings, her acquisition account, the seam behind the warehouse wall, and how far down anybody has opened. She answers exactly what you asked and nothing kinder.</p>
          <p>All three take <b>help</b> as a command, and a bare <b>/sterling</b>, <b>/goblins</b> or <b>/ada</b> will point you at it. Their profiles say the same thing if you click them in the roster.</p>
          <p>Ask any of the three about the other two. They have opinions.</p>
        </div>
        <div class="block">
          <h3>🏧 Goblin Lenders</h3>
          <p>Goblin moneylenders — their machine stands by the casino doors, and their kiosk is under the casino hub. Borrow 1k–1M silver at <b>15–30% interest a day</b>; credit scales with what you own. Miss payments and the collectors escalate daily: marked → garnished → repossessed → frozen → <b>jail</b>. Bail costs 1.5× the debt and doesn't clear it. Sterling disapproves.</p>
          <p>They write, too. Now and then the goblins send a member a personal letter by DM — reading your file back at you — with an <b>introductory rate</b>: a few points off every window for 48 hours, shown on the kiosk while it stands. It's real, and it dies on the first missed day (the posted rate plus a point, as ever). Rarer still, they pitch the whole floor in #general, and Sterling answers.</p>
          <p>They are very friendly right up until you are late. Miss a day and the letters start: one at first, apologetic, then more often and less polite the further down the ladder you go. They stop the moment you settle, and they never reach your phone — only the collectors' daily notice does that.</p>
          <p>The mark is public: a debtor's standing shows on the roster, on profiles and beside their messages. The collectors send a notice every visit. Friends can <b>settle for you</b> at the kiosk before you're jailed, or <b>chip into a bail pot</b> once you are (the pot pays the goblins when it fills, or goes home if the cell ends another way). A prisoner may scratch one line on their cell card. Whatever the goblins repossess goes on <b>their shelf</b>, for sale to anyone — 5× what Sterling pays — and the silver goes back into their vault.</p>
        </div>
        <div class="block">
          <h3>The Wallet</h3>
          <p>The Market's fifth counter. Send silver to any player — pick them, pick an amount, add a note if you like. It arrives straight away and can't be taken back. A profile's <b>Send silver</b> button opens it with that person picked. You can't send silver while you owe the goblins.</p>
        </div>
        <div class="block">
          <h3>The Forge</h3>
          <p>The Market's fourth counter. The <b>Crucible</b> melts emoji you don't want into <b>essence</b> (common 1 · rare 5 · legendary 25; mythics, the talisman and specials won't melt). The <b>Anvil</b> spends essence to raise one emoji a tier — the emoji is consumed and you get a random one of the next tier you don't own yet: common → rare for 12 essence <b>plus 100 silver</b>, rare → legendary for 60 <b>plus 5,000 silver</b>, legendary → mythic for 500 <b>plus a 100,000-silver toll</b> — every toll burned. Essence never becomes silver, and the anvil won't forge a mythic for anyone who owes the goblins.</p>
        </div>
        <div class="block">
          <h3>The Emporium</h3>
          <p>Cosmetics: themes, borders, flair, banners, card backs, dice skins, tombstones, epitaph scripts, titles. Purchases are permanent.</p>
        </div>
        <div class="block">
          <h3>🗝 Pandora's Box</h3>
          <p>The end of the road, under THE HUB. A box with three keyholes and three keys to find: the <b>Prismatic Key</b> for Tier 4 in the VIP Room, the <b>Brass Key</b> for every achievement on the wall, and the <b>Rusted Key</b> for every relic on every level of the Backrooms — all ten levels, all one hundred relics. Sterling messages you when a key is yours. Drag each key to its keyhole (one at a time is fine). With all three in, the box glows — click it and it opens. Sterling announces you in #general, you're issued <b>the Pandoran</b> hazmat, and you choose <b>one</b> thing that changes Solace for everyone. Each world choice can be taken only once, ever; once they're all gone, later openers leave hope in the box. Every opening is engraved on the ledger under the box.</p>
        </div>
        <div class="block">
          <h3>✦ The VIP Room</h3>
          <p>A side shop behind the rope at Sterling's, for people who have <b>finished a collection</b>. Own every common and you're <b>Tier 1 — Collector</b> (copper); every rare too is <b>Tier 2 — Connoisseur</b> (silver); every legendary <b>Tier 3 — Magnate</b> (gold); every mythic <b>Tier 4 — The Complete</b> (prismatic). Each tier also asks for the Backrooms' <b>relics</b>: 2 unlocked for Tier 1, 8 for Tier 2, 14 for Tier 3, and every relic on every level (30) for Tier 4. Each tier opens a shelf of things sold nowhere else — a hazmat colourway with its own metal fittings, worn in the Backrooms, on the casino floor and in the escape room; a marked title; a deck the whole table sees; from gold up, a ring, dice and a name flair. Sterling announces a Magnate's arrivals in #general and rings the bells for The Complete. <b>Tier 4's perks come with the rank</b>: free drinks at the bar, the vial, canister and shot at half price, and once a life the house pays the goblins what you owe — from the cell too. Rank never drops once earned — selling later doesn't cost you the Room. Card decks and dice skins, from the Emporium or the Room, show to everyone at the table.</p>
        </div>
        <div class="block">
          <h3>Custom uploads (free)</h3>
          <p>Settings → Profile: your own banner image and voice entrance/leave sounds (MP3/OGG/WAV, 400 KB).</p>
        </div>
        <div class="block">
          <h3>The shelf rotates daily</h3>
          <p>3 items per department per day (themes always stocked); flips at midnight UTC. One item is the <b>Daily Deal at 20% off</b>; new arrivals are tagged. What you own stays yours forever.</p>
        </div>
        <div class="block">
          <h3>Try before you buy</h3>
          <p>Every theme has a <b>Try it</b> button — the app wears it for 20 seconds, then snaps back.</p>
        </div>

      {:else if page === "games"}
        <div class="block">
          <h3>🚶 THE FLOOR — walk the casino</h3>
          <p><b>Enter the Casino</b> at the top of the Casino. First-person: WASD · SHIFT run · SPACE jump · C crouch · <b>N</b> mic (proximity voice — people near you hear you) · hold <b>B</b> for emotes · <b>E</b> to sit or interact.</p>
          <p><b>Walk up to any game and press E to play it</b> — same games, same money as the buttons above, played on the felt itself. ESC walks away; <b>E at the entrance doors leaves</b>. Players on the 2D pages appear at the tables too, and Sterling tends bar.</p>
          <p><b>♫ The jukebox</b> (north wall): <b>E</b> to search records and play one for <b>60 silver</b>. Nothing plays unless someone pays. Vote to skip for <b>20 silver</b> — 40% of the floor has to agree. The panel also has your own volume and off switch.</p>
          <p><b>🔫 The Casino Gun</b> — under Sterling's counter, <b>150,000 silver</b>, one per person ever. Loaded with 9 rounds + a spare clip (extra clips <b>50,000</b>). Key <b>4</b> draws, click fires, <b>R</b> reloads, <b>G</b> holsters. Getting shot means ten seconds on the carpet and a walk back from the doors — <b>no account ever dies on the floor</b>.</p>
          <p><b>🧪 Slorp</b> — a green vial, <b>1,500 silver</b>, ten minutes, one-way. It gets worse in stages and ends with you coming apart on the carpet in front of everyone. Same as the gun: ten seconds down, nothing real lost.</p>
          <p><b>🍾 Buying a round</b> — at Sterling's bar or under his counter, set <b>for</b> to another player and it goes straight into their pockets. <b>G</b> sets what you're holding on the carpet for anyone to pick up with <b>E</b>; <b>H</b> hands it to whoever you're facing. A vial somebody gives you is taken with a click, like a shot.</p>
          <p><b>🗄 The locker</b> (inside the doors, west): <b>50 slots</b> for the gun and clips. <b>E</b> to store or take. A lockered gun can't be drawn.</p>
        </div>
        <div class="block">
          <h3>🚪 THE ESCAPE ROOM — behind the door east of the jukebox</h3>
          <p>Entry: <b>one RARE emoji, destroyed</b>. You get <b>THE PASS</b> — come and go forever, until you die in there. Death takes the pass. The gun is refused at the door.</p>
          <p>The ante-room has Sterling (flashlights, walkies, almond water — <b>100 each</b>), a locker (what you carry dies with you; what you store survives), and the map of all <b>48 rooms</b>. Your bag holds <b>5 items</b> — the key counts.</p>
          <p><b>Chests:</b> five stand in the complex. <b>E</b> opens one — silver, spins, casino chips, free slot pulls, or rarely an exclusive suit colorway. <b>10 opens a day.</b> Chips spend at Slots/Blackjack/Roulette before silver; free pulls feed the slots.</p>
          <p><b>The key:</b> one exists, in a random room. It takes a bag slot and turns at the exit to open the way out <b>for everyone, for 30 seconds</b> — then a fresh one spawns elsewhere. Hold it too long and it crumbles.</p>
          <p><b>Hunts:</b> the lights go red and a notice names the <b>open blocks</b> — the only doors that still open. Get in one and <b>shut the door</b>: a shut door is absolute safety. Whatever comes out runs twice your speed and kills on touch. Keys still turn during a hunt.</p>
          <p>Keys: <b>F</b> flashlight · <b>G</b> walkie · <b>X</b> almond water · <b>E</b> everything else. Dying costs the pass and the bag — nothing else.</p>
        </div>
        <div class="block">
          <h3>Slots</h3>
          <p>10 silver a pull, 13 ways to win — every triple pays (crowns 250 down to lemons 15), pairs of crowns/diamonds/sevens pay too, a lone cherry returns 1. Free pulls from escape chests spend first, then chips, then silver.</p>
        </div>
        <div class="block">
          <h3>The Emoji Derby</h3>
          <p>Six runners, <b>one ticket per race</b> (up to 500 silver). Cancel for a full refund any time before the gun. The pool splits <b>70/20/10</b> across 1st/2nd/3rd backers; 5% seeds the nightly lottery. Pari-mutuel — you bet against each other, not the house. Form stars hint at chances; ℹ️ shows the racer card.</p>
        </div>
        <div class="block">
          <h3>Blackjack</h3>
          <p>Four tables, 4 seats each. Vegas rules: blackjack pays 6:5, dealer hits soft 17, double on any two, <b>split any matching pair</b> (once; split aces get one card). Six-deck shoe, reshuffled at the cut card. Leaving the table gives up your seat; parked seats time out after 20 minutes.</p>
        </div>
        <div class="block">
          <h3>Roulette</h3>
          <p>One shared European wheel. Red/black and odd/even pay 1:1, dozens and columns 2:1, straight numbers 35:1. First bet opens a 25-second window, then everyone watches the same drop. <b>✕ Clear</b> refunds all your bets while the window's open.</p>
        </div>
        <div class="block">
          <h3>Craps</h3>
          <p>Vegas rules. <b>Pass line</b> on the comeout: 7/11 wins, 2/3/12 loses, anything else sets the point. Back it with <b>odds</b> (true odds, capped 3-4-5x), spread <b>place bets</b>, play the one-roll <b>field</b>, or chase <b>hardways</b> at 9:1. The pass line rides until the point resolves; most other bets can come down between rolls. First pass-line bettor shoots; dice pass on a seven-out.</p>
        </div>
        <div class="block">
          <h3>Texas Hold'em</h3>
          <p>No-limit at three tables (Copper 1/2 · Gold 5/10 · High Roller 25/50; buy in 20–100 big blinds). Real rules with exact side pots. Player-vs-player — the house takes a 5% rake (capped, flopped pots only) that feeds the nightly lottery.</p>
          <p>Hole cards are sent only to you. Leaving mid-hand folds you — committed chips stay in the pot. 30-second turn clock; two timeouts stands you up.</p>
        </div>
        <div class="block">
          <h3>Casino Chess Duel</h3>
          <p>Blitz chess (1/3/5 min) staking an emoji or silver each. Winner takes the pot; a spoils emoji the winner already owns is burned.</p>
        </div>
        <div class="block">
          <h3>The Bone Pit</h3>
          <p>Liar's dice. Same silver ante each, hidden cups, bids climb until someone calls LIAR. Ones are wild; losing a challenge costs a die; last player with dice takes the whole pot. No rake.</p>
        </div>
        <div class="block">
          <h3>🎟️ The Nightly Draw</h3>
          <p>Tickets are 25 silver, <b>one each</b>. At midnight UTC one winner takes 90% of the pot. A draw needs two players — a one-player night refunds and rolls the pot forward. Every 5% rake on the floor feeds this pot, so busy days mean fat draws.</p>
        </div>
        <div class="block">
          <h3>🏆 The Wall of Fame</h3>
          <p>In Leaderboards: biggest wins at every table, Market deeds, lottery and duel champions, and your own standing pinned at the top. Go set a record.</p>
        </div>
        <div class="block">
          <h3>📈 Side bets</h3>
          <p>Spectators can stake silver on chess duels and Bone Pit games before they start. Winners split the pool; 5% seeds the lottery. Players can't bet on their own game.</p>
        </div>
        <p class="note">A restart or crash always refunds in-flight bets and stakes — nobody loses money to a deploy.</p>

      {:else if page === "market"}
        <div class="block">
          <h3>Direct Trade</h3>
          <p>Private barter: offer up to 12 of your emoji for up to 12 of theirs. Nothing moves until they accept, and the trade voids safely if anything changed hands in between.</p>
        </div>
        <div class="block">
          <h3>Auction House</h3>
          <p>List one emoji, everyone bids silver. Outbid silver refunds instantly. Auctions close on a timer (last-minute bids extend it); 5% of the hammer seeds the lottery.</p>
          <p><b>Relic spares sell here too</b> — the only way a relic becomes silver. A relic the winner never recovered unlocks in their collection; a duplicate lands in their locker. Your first copy of any relic can't be listed.</p>
        </div>

      {:else if page === "backrooms"}
        <div class="block">
          <h3>One world, one door</h3>
          <p>Level 0 is one shared maze — everything anyone has walked is charted on the community map, up to sixteen inside at once. Every level has one way in: pick the level from <b>Backrooms</b> → HOME and enter.</p>
          <p><b>A hazmat suit is required.</b> Short of silver? Threshold-4 trades one <b>rare emoji</b> for the Standard Kit (suit + spray can + flashlight) — once each, to get you started.</p>
        </div>
        <div class="block">
          <h3>The floor is not flat</h3>
          <p>One step up is walkable; taller is a wall. Falling is allowed — short drops hurt, deep shafts kill. Furniture is solid but never blocks the only way through.</p>
        </div>
        <div class="block">
          <h3>The only way out</h3>
          <p>Walk back to the door you came in through — on Level 0, the wall outlined in <b>red spray paint</b> — and press <b>E</b> there; it is the same on every level. Dr. Voss debriefs you there. There is no leave button; nothing you carry is safe until you're through.</p>
        </div>
        <div class="block">
          <h3>Controls</h3>
          <p>WASD walk · <b>Shift</b> sprint · <b>Space</b> jump · <b>C</b> crouch (silent) · <b>E</b> interact · <b>G</b> drop · <b>B</b> emotes (hold) · 1–9/scroll slots · click uses hand item · <b>M</b> map · <b>N</b> mic · <b>V</b> walkie (<b>,</b>/<b>.</b> channels) · <b>ESC</b> pause.</p>
          <p><b>Water:</b> Space swims up, C dives, still = tread. Ten seconds under starts drowning. <b>Boats</b> (Level 1): E boards — first aboard steers, a passenger rides up front. Faster than the alligators, and safe from them.</p>
          <p><b>Emotes</b> root you until they finish, and the world doesn't pause. Every key is rebindable in pause → CONTROLS; pause → AUDIO has separate mic/volume settings, saved per machine.</p>
        </div>
        <div class="block">
          <h3>Gear &amp; Research Credits</h3>
          <p><b>The backrooms runs on silver</b> — the same purse as the rest of Solace. Voss buys <b>relic duplicates</b> (1,000) and <b>entity footage</b> (up to 400), and pays out of Async's research budget, which the casino's losses keep topped up. When that budget runs dry she stops buying until it refills.</p>
          <p>Spend it on gear, consumables, suit colors, a backpack (9 slots) and locker space. Upgrades (100/250/500) mostly buy duration; paint colors are free. She does <b>not</b> buy equipment back — she is a researcher, not a pawn shop. Unwanted kit is discarded.</p>
        </div>
        <div class="block">
          <h3>What you leave behind</h3>
          <p><b>Spray paint is permanent</b> — use it to find your way back.</p>
          <p><b>Death throws your body</b>, on camera for everyone nearby. Pause → VIDEO → Blood &amp; gore turns off the red.</p>
          <p><b>Your body lasts 24 hours</b> (dropped items 1 hour) with your full loadout on it — anyone can loot it with <b>E</b>. Nothing marks the spot on any map, and bodies only render within 50 m: recovery runs on memory and spray paint.</p>
        </div>
        <div class="block">
          <h3>Relics</h3>
          <p>Two named, floating sites at a time, far from the doors. <b>E</b> collects; extraction unlocks it in your collection. Spares sell to Voss for 1,000 silver, or to another player at the Auction House. Your first copy is never at risk.</p>
        </div>
        <div class="block">
          <h3>The entity</h3>
          <p>It wanders and hears you: running carries ~10 m, walking ~5 m, crouching is silent — voice and walkie carry further. On sight it charges; you're 20% faster. Break line of sight ~10 s and it gives up. Touch is death.</p>
          <p>Film it for silver — Voss pays by how close you got. Hold right-click to raise the camera, click to record.</p>
        </div>
        <div class="block">
          <h3>Something in the Poolrooms</h3>
          <p>It only cares if you're <b>carrying a relic</b>. It follows you and won't touch you — until you <b>look directly at it</b>. Then it screams and charges faster than you can sprint, and nothing breaks the chase except distance.</p>
          <p><b>Water slows it more than you</b> at every depth — get wet to gain ground, open a big enough gap and it leaves. If it takes the carrier, bystanders are next.</p>
        </div>
        <div class="block">
          <h3>The alligators</h3>
          <p>One per large pool. It only attacks if you're <b>in its water where it can see you</b>. Dry tile is absolute safety — it never leaves its pool. Wading, you outrun it; swimming, it's twice your speed. Three bites kill. Boats are safe and faster.</p>
        </div>
        <div class="block">
          <h3>Giving up</h3>
          <p>Pause → <b>forfeit the run</b>: dies where you stand, no debrief, everything stays on the body. It asks first.</p>
        </div>

      {:else if page === "voice"}
        <div class="block">
          <h3>Joining & the dock</h3>
          <p>Join from the sidebar. The dock (bottom-left) has mute, deafen, devices, per-person volume, and connection dots. 15 minutes of silence disconnects you — watching a stream keeps you seated.</p>
        </div>
        <div class="block">
          <h3>Mic levels & the gate</h3>
          <p>Settings → Voice has a live mic meter. <b>Mic volume</b> boosts you up to 3×; <b>Mic sensitivity</b> is a noise gate — set it just above where the bar sits when you're silent; <b>Speaker volume</b> scales the room. All apply live.</p>
          <p><b>App sounds</b> is the games' volume, separate from voices — slide to 0 for a silent casino.</p>
        </div>
        <div class="block">
          <h3>📷 Camera & 🖥️ screen share</h3>
          <p>Both in the dock. Tick "share tab/system audio" in the picker so viewers hear the content — your own voice chat is kept out of the capture.</p>
          <p>Stream quality is in Settings → Voice & Video: 480p–4K, 15/30/60 fps. Slow viewers fall back to a lighter copy automatically.</p>
        </div>
        <div class="block">
          <h3>Watching streams</h3>
          <p>Streams are opt-in: a "🖥️ Watch" pill appears with a 👁 count, and nothing plays until you join. <b>✕ Leave</b> bows out. The floating stage: click to focus, double-click fullscreen, minimize to a pill, its own volume slider.</p>
          <p><b>⧉</b> pops the stream into its own window — drag, resize, fullscreen — and keep using Solace underneath.</p>
        </div>
        <div class="block">
          <h3>🎛️ The soundboard</h3>
          <p>One shared library on the 🎛️ button in the voice dock — anyone can add sounds (up to 8 each, MP3/OGG/WAV, 400 KB) and anyone in the room can play them. 🎧 previews privately; the 🔇 mutes incoming pads for you only.</p>
        </div>
        <div class="block">
          <h3>Devices, noise suppression, push-to-talk</h3>
          <p>All in Settings → Voice. Noise suppression and push-to-talk follow your account; device picks stay per computer.</p>
          <p><b>Push to talk (hold)</b>: mic opens only while the key is down. <b>Push to mute (hold)</b>: the opposite (cough button). Both work while typing.</p>
        </div>
        <div class="block">
          <h3>Refresh safety</h3>
          <p>Refreshing rejoins voice with your mute state intact. Deploys don't interrupt calls.</p>
        </div>

      {:else if page === "apps"}
        <div class="block">
          <h3>Windows app</h3>
          <p>Get it from the sign-in page. It always runs the newest Solace and updates itself. Closing tucks it into the tray (voice keeps running); tray → Quit exits. Windows warns once: More info → Run anyway.</p>
          <p><b>Push-to-talk (app only):</b> hold <code>Ctrl+Shift+Space</code> to talk — works globally, even mid-game.</p>
          <p><b>Launch at startup:</b> Settings → Appearance → Startup.</p>
        </div>
        <div class="block">
          <h3>Phone</h3>
          <p>solace.zone works in your mobile browser. Add it to your home screen for an app-like feel.</p>
        </div>
        <div class="block">
          <h3>Install from browser</h3>
          <p>Desktop Chrome/Edge offer "Install Solace" in the address bar — lighter than the full app.</p>
        </div>
        <div class="block">
          <h3>Text too small?</h3>
          <p>Settings → Appearance → Font scale. Saved to your account; the desktop app defaults a notch larger (110%).</p>
        </div>
        <div class="block">
          <h3>Filling the screen</h3>
          <p>Settings → Appearance → <b>Display</b>: Windowed, Fullscreen windowed (desktop app only — best for the casino and backrooms), or Fullscreen. Saved per machine. In a browser, Esc leaves fullscreen.</p>
        </div>

      {:else if page === "account"}
        <div class="block">
          <h3>Your recovery secret is your lifeline</h3>
          <p>Set at signup. Needed when signing in from a new place, and it's the only way to reset a forgotten password. Lose both and not even the house can help.</p>
        </div>
        <div class="block">
          <h3>Check where you're signed in</h3>
          <p>Settings → Security lists every live sign-in and your recent sign-in attempts. Don't recognise something? <b>Sign out</b> ends it immediately — or "Sign out everywhere else". Failures you didn't make mean someone's guessing your password: change it and tell an admin.</p>
        </div>
        <div class="block">
          <h3>Profile</h3>
          <p>Settings → Profile: avatar, display name, about-me. Themes and fonts are under Appearance.</p>
        </div>
        <div class="block">
          <h3>Status & going idle</h3>
          <p>Click the status label by your name: Online, Away, or Busy (<b>Busy silences pings</b>). Ten idle minutes marks you 🌙 away. Browsers sign out after 24 idle hours; the desktop app stays signed in.</p>
        </div>
        <div class="block">
          <h3>Blocking & reporting</h3>
          <p>Any profile has Block (no DMs or trade offers; their messages collapse) and Report. Messages have a ⚑ too (press and hold on a phone), and every community card has one. Reports go privately to the admin, who is told the moment one is filed.</p>
          <h3>The rules & the paperwork</h3>
          <p>Solace is 18+ and invite-only. What's allowed is in the <a href="/legal/guidelines.html" target="_blank" rel="noopener">Community Guidelines</a>; the deal is the <a href="/legal/terms.html" target="_blank" rel="noopener">Terms of Service</a>; what's kept about you is in the <a href="/legal/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>. Host a community on your own machine and the <a href="/legal/hosting.html" target="_blank" rel="noopener">Host Agreement</a> makes it yours to keep clean. The games use pretend money — nothing in them is worth anything real.</p>
        </div>
        <div class="block">
          <h3>Feedback</h3>
          <p>Bugs and ideas go on the public Feedback board — the house reads it.</p>
        </div>
        <div class="block">
          <h3>Leaving for good</h3>
          <p>Settings → Security → Delete account. Permanent, password-confirmed, no undo.</p>
        </div>
      {/if}

      <footer class="pager">
        {#if prev}
          <button class="pagebtn" onclick={() => go(prev.id)}>← {prev.label}</button>
        {:else}
          <span></span>
        {/if}
        {#if next}
          <button class="pagebtn next" onclick={() => go(next.id)}>{next.label} →</button>
        {/if}
      </footer>
      <p class="foot">Questions the guide doesn't answer? Ask in chat — someone's always at the table. 🎲</p>
    </main>
  </div>
</div>

<style>
  .howto {
    height: 100%;
    overflow: hidden;
    background: var(--bg);
  }
  .guide {
    display: grid;
    grid-template-columns: 224px minmax(0, 1fr);
    height: 100%;
    max-width: 1160px;
    margin: 0 auto;
  }
  .nav {
    padding: clamp(18px, 4vh, 36px) 14px 20px 18px;
    border-right: 1px solid var(--line);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .nav h1 {
    margin: 0 0 2px 8px;
    font-size: 1.25rem;
    color: var(--ink);
  }
  .tag {
    margin: 0 0 14px 8px;
    color: var(--ink-dim);
    font-size: 0.76rem;
    line-height: 1.4;
  }
  .navbtn {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    border: none;
    border-radius: 9px;
    background: none;
    color: var(--ink-soft);
    font: inherit;
    font-weight: 600;
    font-size: 0.88rem;
    text-align: left;
    cursor: pointer;
  }
  .navbtn:hover {
    background: var(--panel-2);
    color: var(--ink);
  }
  .navbtn.active {
    background: color-mix(in srgb, var(--accent) 14%, var(--panel-2));
    color: var(--ink);
  }
  .ni {
    width: 22px;
    text-align: center;
    flex: none;
  }
  .content {
    padding: clamp(20px, 4vh, 40px) clamp(22px, 4vw, 48px) 48px;
    overflow-y: auto;
    min-width: 0;
  }
  h2 {
    margin: 0 0 18px;
    font-size: 1.45rem;
    color: var(--ink);
  }
  .block {
    padding: 14px 18px;
    margin-bottom: 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 0.98rem;
    color: var(--ink);
  }
  p {
    margin: 0 0 10px;
    color: var(--ink-soft);
    font-size: 0.92rem;
    line-height: 1.6;
    max-width: 78ch;
  }
  p:last-child {
    margin-bottom: 0;
  }
  p b {
    color: var(--ink);
  }
  code {
    padding: 1px 6px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 0.82em;
  }
  .note {
    margin: 4px 2px 0;
    font-size: 0.84rem;
    color: var(--ink-dim);
  }
  .pager {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 22px;
  }
  .pagebtn {
    padding: 10px 16px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
    color: var(--ink-soft);
    font: inherit;
    font-weight: 600;
    font-size: 0.86rem;
    cursor: pointer;
  }
  .pagebtn:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .pagebtn.next {
    margin-left: auto;
  }
  .foot {
    text-align: center;
    color: var(--ink-dim);
    font-size: 0.84rem;
    margin-top: 26px;
    max-width: none;
  }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .guide {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }
    .nav {
      flex-direction: row;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      border-right: none;
      border-bottom: 1px solid var(--line);
      padding: 10px 12px;
      /* A chip strip, not a scroll pane: no scrollbar under the chips (it
         drew a second bar beside the content's), and momentum scrolling. */
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      /* The last chip is cut mid-word at the edge — that IS the affordance
         that there's more; the fade below softens the cut. */
      mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent);
    }
    .nav::-webkit-scrollbar {
      display: none;
    }
    .nav h1,
    .tag {
      display: none;
    }
    .navbtn {
      white-space: nowrap;
      flex: none;
      padding: 7px 11px;
      border: 1px solid var(--line);
      border-radius: 999px;
      font-size: 0.82rem;
    }
    .navbtn.active {
      border-color: var(--accent);
    }
    .content {
      padding: 18px 16px 40px;
    }
    h2 {
      font-size: 1.3rem;
      margin-bottom: 14px;
    }
    .block {
      padding: 12px 14px;
    }
  }
</style>
