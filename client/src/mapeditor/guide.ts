// THE MAP EDITOR's HOW-TO (Josh, 2026-09-27: "put a how to guide section in
// the map editor so I know how to use it for making/ updating maps").
//
// Plain, short, in the order you'd need it. Level-specific lines come from
// the level number (0 the Lobby, 1 the Poolrooms, 2 Pipe Dreams). When the
// editor gains a control, add it here in the same commit — a guide that lies
// is worse than none.

interface Section {
  id: string;
  title: string;
  body: string;
}

const kbd = (k: string): string => `<kbd>${k}</kbd>`;

export function guideSections(level: number): Section[] {
  /** The line for this level: Lobby, Poolrooms, Pipe Dreams, the Station, the
   *  office (which shares the Station's lattice, so it reads the Station's
   *  line unless it has its own). */
  const by = (lobby: string, pools: string, pipes: string, station: string, office: string = station, hotel: string = office, lights: string = hotel, ocean: string = lights, cave: string = lights, suburb: string = cave): string =>
    level === 0 ? lobby : level === 1 ? pools : level === 3 ? station : level === 4 ? office : level === 5 ? hotel : level === 6 ? lights : level === 7 ? ocean : level === 8 ? cave : level === 9 ? suburb : pipes;
  return [
    {
      id: "idea",
      title: "How a level is made",
      body: `
        <p>A level is a <b>set of rooms you draw</b>, plus a <b>seed</b>. The generator picks rooms from your list and joins them doorway to doorway. You draw the rooms; it builds the map.</p>
        ${by(
          `<p><b>The Lobby (Level 0):</b> rooms are packed wall to wall across the whole map, like the classic backrooms. Every room is drawn in 10-cell <b>modules</b> and fills its whole rectangle. The generator packs rooms edge to edge, groups the room types into districts, and opens enough doorways to connect everything, plus extras for loops. There is one way in and out: The Entrance, on the edge of the map. THE DOOR to Level 1 lands at the deepest point from it; the key waits in the landmark farthest from THE DOOR.</p>`,
          `<p><b>The Poolrooms:</b> the level grows out from The Landing, the one way in and out, in three zones: the <b>sunlit baths</b> nearest it, the <b>arcades</b> round them, and <b>the deep</b> beyond. A room's <b>set</b> says which zone it may stand in (<b>any</b> goes anywhere). Every room's water is its own; boats sit on the long lap pools, alligators in the big deep waters.</p>`,
          `<p><b>Pipe Dreams:</b> a route runs from the drain down three decks to the pressure door. The halls on it are the ones with a minimum. Everything else hangs off the route's spare doorways.</p>`,
          `<p><b>The Electrical Station:</b> rooms are packed wall to wall in 8-cell <b>modules</b>, like Level 0 but denser. The pressure door from Pipe Dreams is the one way in; the lift shutter to Level 4 is in the goal room. Every room belongs to one of <b>six sections</b>, each on its own circuit: each section gets one <b>breaker room</b> and one cutoff, and the generator keeps every cutoff reachable without crossing live water.</p>`,
          `<p><b>The Abandoned Office:</b> rooms are packed wall to wall in 8-cell <b>modules</b>, the Station's lattice. The Lift is the one way in, on the edge of the map. The <b>Security Office</b> (the room with the keycard, <b>K</b>) lands as far from it as the map allows, and <b>the Stairwell</b> (the stairwell door, <b>S</b>) as far from both. Every room sits in one of <b>eight blink zones</b> — the troffers dip a zone at a time. Most troffers (<b>*</b>) are dead: the generator rolls each one, except in the Lift Lobby, which is always lit. Windows go on the building's outer walls by themselves.</p>`,
          `<p><b>The Terror Hotel:</b> rooms are packed wall to wall in 8-cell <b>modules</b>, the office's lattice. Every room is in the <b>hall</b> or the <b>boiler</b> zone: the Boiler Room takes the five rows of modules farthest from the Service Stair (the one way in, <b>D</b>), and the two zones meet at <b>one</b> doorway — the room with the gate role. <b>The Beverly Room</b> (the hub, with the guest register <b>R</b>) lands near the middle of the hall, and <b>the Rusty Door</b> (<b>S</b>) as deep below stairs as it can. A <b>suite</b> has exactly one doorway and one key hook (<b>K</b>); the register names one suite per map, and every suite gets a number no corridor door carries. Lifts (<b>L</b>) stand in lift halls, furnaces (<b>F</b>) below stairs, moth nests (<b>N</b>) in the dark rooms. Number plates go on corridor doors as signs whose words are a number.</p>`,
          `<p><b>Lights Out:</b> rooms are packed wall to wall in 8-cell <b>modules</b>, the hotel's lattice. Every room is in the <b>dark</b> corridors or <b>the Wet End</b> (set <b>wet</b>): the Wet End takes the three rows of modules farthest from the Stair (the one way in, <b>D</b>), and every floor cell of a wet room is under ankle-deep water. <b>The Sea Hatch</b> (<b>H</b>) lands deep in the Wet End. Draw <b>K</b> wherever the Handwheel may lie and <b>B</b> wherever a spare battery may turn up — dry rooms only; the generator puts the wheel on one far spot per seed. Every fixture down here is dead: <b>*</b> is a caged bulkhead, <b>=</b> a fluorescent batten.</p>`,
          `<p><b>Thalassophobia:</b> a drowned city drawn in 10-cell <b>blocks</b>, packed edge to edge. Blocks are in <b>the city</b> or <b>the Drop</b> (the generator lays the Drop round the map's rim). Paint each cell's type: <b>t</b> the tower (the start block only), <b>r</b> a roof out of the water, <b>w</b> a roof just under it (waist deep), <b>s</b> a sunk roof (deeper), <b>c</b> a street (water, 6m), <b>p</b> the sunken square (24m, the goal block only), <b>d</b> the deep (Drop blocks only), <b>#</b> a building rising into the fog. Water cells take their own depth whatever height you draw. Blocks open to each other through the water (a 2-wide street doorway). <b>D</b> is the hatch in the tower, <b>U</b> the subway stair on a wall at the bottom of the square, <b>K</b> wherever the Diving Helmet may lie (dry roofs only), <b>*</b> a lamp in the tower.</p>`,
          `<p><b>The Cave System:</b> rooms are packed wall to wall in 8-cell <b>modules</b>, a 2-wide doorway slot in the middle of each module side, on floor 0. Each room is in <b>the Station</b>, <b>the Caverns</b> or <b>the Deep</b> (the generator lays them in bands out from the way in). Paint each cell's type: <b>p</b> platform, <b>t</b> the flooded track, <b>h</b> a ticket hall, <b>b</b> where the tunnel broke into rock, <b>c</b> cavern, <b>g</b> a terraced cavern, <b>r</b> the river, <b>x</b> a chasm, <b>o</b> an open hollow, <b>s</b> a narrow passage and <b>k</b> a crawlspace (the Burrower's, Deep only — a crawlspace is crouch-only). Track and river rooms are laid in one unbroken line by the generator, not packed. Heights make the cave: a step of one is a slope, two or more a ledge you can drop off but not climb (always leave a way round), <b>i</b> or lower a drop that kills. <b>D</b> is the subway stair, <b>C</b> the Chimney, <b>R</b> wherever the Climbing Rope may lie (Caverns, dry floor), <b>*</b> a lit work lamp, <b>=</b> a dead batten, <b>~</b> a flickering platform lamp.</p>`,
          `<p><b>The Suburbs:</b> rooms are drawn in 8-cell <b>modules</b>, a 2-wide doorway slot in the middle of each module side, on floor 0. Rooms are <b>street</b> pieces or <b>lot</b> pieces. The generator lays the streets as a grid (rows of modules across the whole map, cross streets between them, the middle one running out to the manhole's cul-de-sac on the rim) and picks, at each street module, the piece whose road runs out of exactly the sides that have street next door — so draw straights, tees and crossings. Lots fill the blocks between: paint each cell's type: <b>r</b> road, <b>w</b> sidewalk, <b>y</b> yard, <b>h</b> house, <b>g</b> garage, <b>k</b> park, <b>q</b> Number 9's porch. Houses are thin-walled — give each a front door and a back door. <b>D</b> is the manhole (the start room), <b>F</b> the front door of Number 9 (the goal room, on its far side), <b>K</b> wherever the House Key may lie (indoors), <b>*</b> a lit streetlight, <b>=</b> a dead one, <b>~</b> a flickering one, <b>P</b> Number 9's lit porch light and <b>p</b> a dead porch light (it marks which way a house faces). The Watch stays out of the light.</p>`,
        )}
        <p>The <b>seed</b> decides which map you get from the same rooms. Change it for a different layout, or press <b>Try seeds</b> to see six side by side and pick one.</p>
        <p><b>Nothing you do reaches players until you Publish.</b> Everything before that is a draft.</p>`,
    },
    {
      id: "screen",
      title: "The screen",
      body: `
        <ul>
          <li><b>Left</b> — your rooms, grouped by what they do. Click one to open it. ⚠ means it has a problem; tick <b>only rooms with problems</b> to see just those.</li>
          <li><b>Middle</b> — the room you're editing. Layer tabs above it, the palette for that layer below.</li>
          <li><b>Right</b> — the room's settings, its checks, and a 3D view (<b>⤢ Bigger</b> fills the screen). Its camera works like Unreal's: hold the <b>left</b> button and move the mouse to look around, and with the mouse over it ${kbd("W")} / ${kbd("S")} move forward and back where you're looking, ${kbd("A")} / ${kbd("D")} move left and right, ${kbd("Q")} / ${kbd("E")} go down / up, ${kbd("Shift")} is faster. The <b>right</b> button pans and the wheel moves you in and out. <b>💡 Lights</b> shows the room lit the way the game lights it — which lights are on, where it's bright and where it's dark, the flickering ones flickering — without a test play. <b>Walk it</b> puts you inside the room: ${kbd("W")}${kbd("A")}${kbd("S")}${kbd("D")} walk, ${kbd("Shift")} runs, the mouse or the arrow keys look, ${kbd("Esc")} stops. On a laptop's trackpad in the Mac app, just move — no need to hold the button.</li>
          <li><b>Top</b> — which level, the seed, Try seeds, See the whole level, History, <b>Test play</b>, Publish, and this Guide.</li>
        </ul>
        <p>Zoom the grid with the − + buttons or ${kbd("Ctrl")} + mouse wheel.</p>
        <p><b>Measure</b> (in the tools under the grid, on every layer) — drag between two points to see how far apart they are in metres, and how far the floor goes up or down between them. Right-click or ${kbd("Esc")} clears it.</p>`,
    },
    {
      id: "layers",
      title: "Drawing a room (the layers)",
      body: `
        <ul>
          <li><b>Tools</b> — on Floor, Heights and Rooms: <b>Brush</b> paints cell by cell, <b>Box</b> fills a rectangle you drag, <b>Fill</b> changes every joined cell that looks the same. On Walls, Box puts walls round the rectangle you drag. Right-click with any of them erases. <b>Select</b> works on every layer — see "Moving and copying".</li>
          <li><b>Floor</b> — paint what each cell is: floor, <b>#</b> solid, or not part of the room. Right-click erases. The letters under "Floor of another type" give part of a room a different look and ceiling.</li>
          <li><b>Heights</b> — floor height in half-metre steps. ${by(
            `A step of one is a ramp you can walk. Two or more is a ledge you can drop off but not climb. <b>−9 and deeper is a lethal shaft.</b> Keep the doorway slots at 0. <b>Floor only</b> (the usual) moves just the floor — the ceiling stays at the room's own height, so a dropped floor is a sunken pit under the room's ceiling; those cells show a blue bar along the top. Re-paint an old dip this way to lift its ceiling back up. <b>Floor and ceiling</b> moves the ceiling with it.`,
            `Anything drawn <b>below −1 is under water</b>: −2 ankle, −3 waist, −4 and deeper you swim. A pool is just a sunken floor. A body of water 800 cells or bigger, and deep enough somewhere, gets an alligator.`,
            `Doorways sit on a deck: 0, +6 or −6. Only a catwalk may drop into an engine-hall pit. <b>Floor only</b> (the usual) moves just the floor and keeps the room's ceiling (a blue bar marks those cells; re-paint an old dip to lift its ceiling); <b>Floor and ceiling</b> moves both.`,
            `A step of one is a ramp you can walk; two or more is a ledge you can drop off but not climb. The station has no shafts. Keep the doorway slots at 0.`,
            `The office is a flat floor: keep it at 0 unless a step is the point, and keep the doorway slots at 0.`,
            `A step of one is a ramp you can walk; two or more is a ledge you can drop off but not climb. Keep the doorway slots at 0.`,
            `A step of one is a ramp you can walk; two or more is a ledge you can drop off but not climb. Keep the doorway slots at 0.`,
            `A step of one is a ramp you can walk; two or more is a ledge you can drop off but not climb. Keep the doorway slots at 0. Anything drawn below the sea's surface is water you swim in.`,
            `Heights make the cave. A step of one is a ramp you can walk; two or more is a ledge you can drop off but not climb. Keep the doorway slots at 0. A drop deep enough is a chasm, and a chasm kills.`,
            `A step of one is a ramp you can walk; two or more is a ledge you can drop off but not climb. Keep the doorway slots at 0.`,
          )}</li>
          <li><b>Stairs</b> — drag from the top of a stair to the bottom; each cell steps down one.${level === 2 ? "" : " (This level mostly uses gentle height steps instead.)"} They are drawn as real steps. How they look is the room&#39;s <b>Stairs</b> box in the settings on the right: a texture, a colour, how many steps a cell, how wide the flight is, and rails on its open sides. A narrower flight keeps its middle and gets a sloped side either edge.</li>
          <li><b>Rooms</b> — split one drawing into several rooms. A wall goes between two labels unless you put an inner door there.</li>
          <li><b>Walls</b> — thin walls inside a room: drywall, partitions, cubicles, a maze. Click or drag along the edge between two cells; right-click takes a wall down.${level === 0 ? " <b>This is how Level 0's rooms get their walls</b> — use # only for solid things like pillars or a table." : ""}</li>
          <li><b>Furniture</b> — the level's built-in fittings (see the palette). Wall pieces find the wall behind them. Big pieces stamp their whole size — ${kbd("R")} turns the stamp. Shift-click a placed piece to turn it.${level === 0 ? " Level 0's everyday furniture is placed by the game itself; the palette here has The Entrance." : ""}</li>
          <li><b>Props</b> — models from your prop kit, and signs. See "Props".</li>
          <li><b>Doors</b> — click the edge of a cell. See "Doorways".</li>
          <li><b>Game</b> — creatures and where relics and lore drives lie. See "Creatures and spots".</li>
        </ul>
        ${
          level === 1
            ? `<p><b>Water rules:</b> next to the water line a floor must be one step up, or four or more (a 2–3 step lip is refused — it's too high to climb out and too low to read as a ledge). Bridge decks stand at +1 or higher. A ladder stands in the water with the deck beside it.</p>
               <p><b>Walls:</b> draw pool rooms with <b>#</b> walls round them. Portholes, windows, benches and arches need real wall behind them. A <b>window</b> is a tall arched window with daylight behind it.</p>`
            : ""
        }`,
    },
    {
      id: "doors",
      title: "Doorways",
      body: `
        <p>On the <b>Doors</b> layer, click the edge of a cell:</p>
        <ul>
          <li>On the room's <b>outside edge</b> → a doorway the generator joins through (green).</li>
          <li><b>Between two rooms</b> of one drawing → an inner door (blue).</li>
        </ul>
        <p>Pick the width in the palette first. <b>Two rooms join only where their doorways meet with the same width and the same floor.</b></p>
        ${by(
          `<p><b>Level 0:</b> doorways are <b>slots</b> — 2 wide, 4 cells into each 10-cell module side (cells 4 and 5). Put one on every module side you want joinable; the generator opens enough of them to connect the level and a share of the rest for loops.</p>`,
          `<p><b>The Poolrooms:</b> doorways are 3 wide on dry floor at 0 (small rooms can use 1 wide) — keep the water inside the room.</p>`,
          `<p><b>Pipe Dreams:</b> galleries use 3-wide doorways, corridors 2, rooms and tunnels 1.</p>`,
          `<p><b>The Station:</b> doorways are <b>slots</b> — 2 wide, 3 cells into each 8-cell module side (cells 3 and 4). Put one on every module side you want joinable.</p>`,
          `<p>Doorways are <b>slots</b> — 2 wide, 3 cells into each 8-cell module side (cells 3 and 4). Put one on every module side you want joinable.</p>`,
          `<p>Doorways are <b>slots</b> — 2 wide, 3 cells into each 8-cell module side (cells 3 and 4). Put one on every module side you want joinable.</p>`,
          `<p>Doorways are <b>slots</b> — 2 wide, 3 cells into each 8-cell module side (cells 3 and 4). Put one on every module side you want joinable.</p>`,
          `<p>Doorways are <b>slots</b> — 2 wide, 4 cells into each 10-cell block side (cells 4 and 5). Put one on every block side you want joinable.</p>`,
        )}
        <p>Keep the cell just inside a doorway clear of furniture.</p>`,
    },
    {
      id: "props",
      title: "Props",
      body: `
        <p>Open the <b>Props</b> layer. Search, or pick a shelf, click a prop, then click in the room. Tick "every level's props" to see the whole kit.</p>
        <p>Click a placed prop to select it, drag it to move it. With one selected:</p>
        <table class="keys">
          <tr><td>${kbd("R")}</td><td>turn 90°</td></tr>
          <tr><td>${kbd("Shift")}+${kbd("R")}</td><td>turn 15°</td></tr>
          <tr><td>${kbd("[")} ${kbd("]")}</td><td>change its look</td></tr>
          <tr><td>${kbd("PgUp")} ${kbd("PgDn")}</td><td>raise / lower</td></tr>
          <tr><td>arrow keys</td><td>nudge</td></tr>
          <tr><td>${kbd("Ctrl")}+${kbd("D")}</td><td>duplicate</td></tr>
          <tr><td>${kbd("Delete")}</td><td>remove</td></tr>
          <tr><td>${kbd("Esc")}</td><td>deselect</td></tr>
        </table>
        <p>"snap" sets how finely props move. Wall props slide onto the nearest wall; ceiling props hang from the ceiling. A solid prop can't block a doorway or cut a room in two.</p>
        <p><b>In 3D:</b> click a prop in the 3D view to pick it. Arrows appear on it — drag one to slide it that way; the <b>green</b> one lifts it up and down. <b>⟳ Turn</b> swaps the arrows for three rings: turn it, tip it forward or lean it sideways. <b>⇲ Size</b> (shapes) stretches it along a side. Use <b>⤢ Bigger</b> for room to work. In the settings, <b>tip</b> and <b>lean</b> do the same by number.</p>
        <p><b>Shapes</b> are on the Shapes shelf: cube, cylinder, pyramid, cone, sphere, pillar, square pillar and wedge. Give one a size in metres, any wall, floor or ceiling texture (or your own), a colour, and untick "people walk around it" to make it something you walk through.${level === 0 ? " On Level 0 they take only the backrooms' own textures." : ""}</p>
        <p><b>Not in every copy:</b> "appears in" makes a prop show up in only some of the room's copies (half, 1 in 4…), so a room used many times doesn't look copy-pasted. It's the same copies every time.</p>
        <p><b>Signs</b> are on the Signs shelf: painted words, paper notes, metal signs and floor writing. Place one, then type its words (up to 60 letters) in its settings.</p>
        <p><b>Doors that open</b> (Doors & openings → Doors, marked "opens when someone walks up") swing open by themselves as a player comes close, and close behind them. Stand one in a doorway gap.</p>
        <p><b>New models:</b> drop downloads in <code>assets/New Assets</code> and tell Claude — they come back fixed, named and on the right shelf here.</p>`,
    },
    {
      id: "select",
      title: "Moving and copying",
      body: `
        <p>Pick <b>Select</b> in the tools and drag a box over part of the room. The box takes everything in it — floor, heights, walls, furniture, props and markers.</p>
        <table class="keys">
          <tr><td>drag inside the box</td><td>move it (what stands on the floor goes with it; the floor stays)</td></tr>
          <tr><td>${kbd("Ctrl")}+${kbd("C")} / ${kbd("Ctrl")}+${kbd("X")}</td><td>copy / cut</td></tr>
          <tr><td>${kbd("Ctrl")}+${kbd("V")}</td><td>paste — it follows the mouse; click to put it down. Works in another room too.</td></tr>
          <tr><td>${kbd("R")} / ${kbd("F")}</td><td>turn / flip it</td></tr>
          <tr><td>arrow keys</td><td>nudge it a cell</td></tr>
          <tr><td>${kbd("Delete")}</td><td>clear what's on it (${kbd("Shift")}+${kbd("Delete")} takes the floor too)</td></tr>
          <tr><td>${kbd("Esc")} / right-click</td><td>drop the selection, or cancel a paste</td></tr>
        </table>
        <p>The same buttons are on the right while something is selected. Pasting past the edge makes the room bigger.</p>`,
    },
    {
      id: "game",
      title: "Creatures and spots",
      body: `
        <p>Open the <b>Game</b> layer, pick one and click in the room. Click a placed one to change it; drag to move; ${kbd("Delete")} removes.</p>
        <ul>
          ${level <= 2 ? `<li><b>The Entity</b> — it wanders near where you put it and hunts whoever it sees or hears. Set how many, how fast, how far it sees and how far it wanders (the dotted ring). ${level === 2 ? "Pipe Dreams has no creatures except the ones you place." : ""}</li>` : ""}
          ${level === 1 ? `<li><b>Alligator</b> — put it in deep water. It never leaves that water. Set how many, speed, how far it sees and how hard it bites. A pool with one of yours gets no other alligator.</li>` : ""}
          <li><b>Relic spot</b> — relics turn up on these first, then anywhere deep.</li>
          ${level === 0 ? `<li><b>Lore drive spot</b> — drives lie on these first; any left over find their own place.</li>` : ""}
        </ul>
        <p>Every one has "appears in", so it can be in only some copies of the room. None of this resets the level when you publish.</p>`,
    },
    {
      id: "looks",
      title: "Look, lights and sound",
      body: `
        <p>In the room's settings, on any level:</p>
        <ul>
          <li><b>Look</b> — its walls, floor and ceiling. Leave one on its default to keep ${level === 0 ? "the room type's own" : "the level's own"}. Only the room's own floor wears it; a corner painted another type keeps its own.${level === 0 ? " Level 0 only offers the backrooms' own surfaces (the yellow papers, manila, wood panelling, the carpets, the drop ceiling) — no pool tile or Pipe Dreams concrete. Your own uploaded textures are allowed." : ""}</li>
          <li><b>+ Add a texture…</b> — upload a photo (PNG, JPEG or WebP, up to 8 MB). Say whether it's a wall, floor or ceiling and how many metres one repeat covers. It joins the list for every room on every level.</li>
          <li><b>Lights</b> — how many are on, how many flicker, and how bright the room is. "None" turns the fixtures off; they're still there.</li>
          <li><b>Sound</b> — a sound the room plays while somebody stands in it: dripping water, buzzing lights, machinery, a radio, wind, music through the wall, another level's hum, or silence. <b>▶ Listen</b> plays it.</li>
        </ul>
        <p>All of it publishes without resetting the level.</p>`,
    },
    {
      id: "settings",
      title: "Room settings",
      body: `
        <ul>
          <li><b>id</b> — the room's own name in the list. Lowercase and dashes.</li>
          <li><b>name on the map</b> — only for set pieces (e.g. ${by('"The Long Table"', '"The Grand Lido"', '"Turbine Hall"', '"The Lift Hall"')}); shows on the operator map.</li>
          <li><b>role</b> — what it does: ${by(
            "<b>start</b> (the room with The Entrance), <b>landmark</b> (a named set piece — the key hides in one), <b>block</b> (every ordinary room)",
            "<b>door</b> (The Landing), <b>hall</b>, <b>corridor</b> (a passage), <b>room</b> (hangs off a hall or passage), <b>cap</b> — and a <b>set</b>: baths, arcades, deep or any",
            "<b>start</b> (the drain), <b>goal</b> (the pressure door), <b>gallery</b>, <b>stair</b>, <b>hall</b>, <b>corridor</b>, <b>room</b>, <b>cap</b>",
            "<b>start</b> (the pressure door), <b>goal</b> (the lift shutter), <b>breaker</b> (a section's breaker room — put a <b>B</b> on its wall), <b>block</b> (every ordinary room)",
            "<b>start</b> (the room with the level's way in), <b>block</b> (every ordinary room), and the level's own set-piece roles — the role list shows which",
          )}.</li>
          <li><b>type</b> — the floor look and the ceiling height${level === 0 ? ", and what furniture the game puts in it. Level 0 has thirteen: the yellow classics, plus <b>manila</b> (darker, half the lights out), <b>restrooms</b> (stalls and basins), <b>panelled</b> (wood and green carpet), <b>storage</b> (tall, dim, shelving) and <b>unlit</b> (no lights at all)" : ""}.</li>
          <li><b>weight</b> — how often it's picked (1 is normal, 3 is three times as often).</li>
          <li><b>min</b> / <b>max</b> — at least / at most this many in the level.</li>
          <li><b>width</b> / <b>height</b> and the move arrows — resize the drawing or shift everything in it.${level === 0 ? " Level 0 rooms stay whole modules: 10, 20, 30 or 40 cells." : ""}</li>
        </ul>`,
    },
    {
      id: "checks",
      title: "Checks",
      body: `
        <p>The <b>Checks</b> box shows what's wrong with the room you're on, as you draw.</p>
        <ul>
          <li><b>Red</b> must be fixed — the level won't build or publish with it. Problem cells are outlined red on the grid. Click a check that names a spot and the grid takes you there.</li>
          <li><b>Yellow</b> is a warning — worth a look, not a blocker.</li>
          <li><b>Floor no door can reach</b> (a pit you can't climb out of, a room behind a wall with no way in) becomes <b>scenery</b>: drawn in the game, but nobody can walk or fall into it. It's hatched on the grid and only a yellow warning, so it won't stop a test play or a publish. If you didn't mean it, that's your clue.</li>
        </ul>
        <p>"No problems — the generator can use this room" means it's good.</p>
        <p><b>Weight</b> (in the room's settings, and on the Props tab) shows how heavy the room's props are for the game to draw. 100% is as heavy as the busiest spot on any live level today. Past that, players may stutter there.</p>`,
    },
    {
      id: "whole",
      title: "See the whole level",
      body: `
        <p>Builds the real map from your rooms and seed, exactly as it would go live. It lists any rule the level breaks, the numbers (${by(
          "rooms, doorways, how far THE DOOR is from The Entrance, lore drives",
          "zones, water, alligators, loops",
          "route length, lit rooms, loops",
          "rooms, breakers and cutoffs, live water, arcing panels",
          "rooms, doorways, and where the level's way in and its objective are",
        )}), and the map.</p>
        <p>Hover a piece to see which room it is; click it to open that room. To compare layouts, use <b>Try seeds</b> at the top. <b>Where is it used?</b> in a room's settings opens this view with every copy of that room in green.</p>
        <p>The buttons at the top right lay information over the map:</p>
        <ul>
          <li><b>Deaths</b> — where players died on the live map, and what killed them.</li>
          <li><b>Nobody's been</b> — pink is floor no player has ever seen.</li>
          <li><b>Distance</b> — blue is near the level's door, red is far.</li>
          <li><b>Can't reach</b> — pink is floor nobody can walk to from the door. A problem about unreachable floor opens this when you click it.</li>
          <li><b>Weight</b> — how heavy the props are to draw, in squares of 16×16 cells. Green is fine, amber is getting full, red is heavier than anything live today.</li>
        </ul>
        <p>Deaths and "nobody's been" come from the live map; if your draft changes the map itself, some may not line up.</p>`,
    },
    {
      id: "saving",
      title: "Saving, undo and history",
      body: `
        <ul>
          <li>Your changes <b>save as a draft by themselves</b> (${kbd("Ctrl")}+${kbd("S")} saves now). A draft never changes the live map.</li>
          <li>${kbd("Ctrl")}+${kbd("Z")} undoes and ${kbd("Ctrl")}+${kbd("Y")} redoes, per room.</li>
          <li><b>Discard draft</b> throws your draft away and goes back to what's live.</li>
          <li><b>History</b> lists every published version. Opening one copies it into your draft — to undo a publish, open the older version and publish it again. <b>Compare with my draft</b> shows that version and your draft side by side: switch Before / After, changed rooms are yellow, new ones green.</li>
          <li>Switching level at the top saves your draft first.</li>
        </ul>`,
    },
    {
      id: "test",
      title: "Test play",
      body: `
        <p><b>Test play</b> lets you walk your draft in the real game — its creatures, water, lights and sounds — before anyone else sees it. It takes you to the Backrooms with the level ready to enter.</p>
        <ul>
          <li>Nobody else can enter that level while you test. It can only start when nobody is on it.</li>
          <li>Nothing counts: dying costs you nothing, and relics, drives and the key aren't kept.</li>
          <li>It ends when you walk out or die (or press <b>End the test</b>). The level then plays its live map again, exactly as it was.</li>
        </ul>`,
    },
    {
      id: "publish",
      title: "Publishing",
      body: `
        <p><b>Publish</b> checks every room and the whole level first, then lists what changes: rooms added, redrawn or taken out, doorways moved, props placed or taken away. It won't go if anything is broken.</p>
        <p><b>Props, looks, lights, sounds and markers only?</b> Then players keep everything: the charted map, spray paint and whatever is lying on the floor. It goes live straight away, even with people down there, and they see the new props.</p>
        <p><b>Anything else</b> — a room redrawn, a doorway moved, a new seed — makes it a new map. It waits until nobody is on that level. Players who go down from then on walk the new map; its charted map starts fresh and anything left lying on the old map is gone. Relics people have unlocked and their lockers are not touched.${level === 0 ? " Lore drives already found stay found, and if THE DOOR was opened it stays open." : ""}</p>
        <p>Add a short note of what you changed — it shows in History.</p>
        <p><b>Then tell Claude</b> you published, so the new design gets saved into the code as well.</p>`,
    },
    {
      id: "recipes",
      title: "Quick recipes",
      body: `
        <ul>
          <li><b>Change one room</b> — open it, edit, make sure Checks is clean, See the whole level, Publish.</li>
          <li><b>Add a new room</b> — easiest is <b>Duplicate</b> a similar room and change it. Or New room: draw the floor, add doorways, set role and type, give it a weight.</li>
          <li><b>More or fewer of a room</b> — change its weight, or set min / max.</li>
          <li><b>Same rooms, new layout</b> — change the seed, See the whole level until you like it, Publish.</li>
          <li><b>Dress a room</b> — Props layer, place, turn, done. Props move with the room wherever it's used, and publishing only props keeps the level's map.</li>
          <li><b>Feel a room's size</b> — Walk it, under the 3D view.</li>
          <li><b>Reuse part of a room</b> — Select it, ${kbd("Ctrl")}+${kbd("C")}, open another room, ${kbd("Ctrl")}+${kbd("V")}, click.</li>
          <li><b>Make a room scary</b> — Lights: a few, lots flickering, dark. Sound: wind or a radio. Game: an Entity that stays close.</li>
          <li><b>Try it for real</b> — Test play, then walk out.</li>
          <li><b>Undo a publish</b> — History → open the version before → Publish.</li>
        </ul>`,
    },
  ];
}
