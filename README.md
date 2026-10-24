# Workboat World

**Workboat World** (v1.0) is a browser-based VR sea rescue and operations game: chunky flat-shaded boats that you operate from the inside, with physical levers, wheels, switches and live instruments. It's built with TypeScript, Vite, Three.js and WebXR, and targets the Meta Quest 3 and desktop browsers.

**Four tiles on the front page** (https://tartanski-cpu.github.io/SWVR/), each with its picture: the three ways to play, and the **Shipyard** (design a boat and take her to sea). **Career** (the game as it was: one boat, jobs, money and upgrades, your crew join aboard her playing your career), **Voyage** (a real stretch of coast made from map data, sailed for its own sake: pick a map, no career: the jobs, radio calls and cargo all go on, and pay, but the money is this session's only (not saved), with no contracts or duty board; and a boat never starts damaged, only from a real crash; a **Shipyard** sign beside the planning table opens the Shipyard on your boat, to change her or design her anew (on your own, or hosting with no crew aboard); nothing is saved but where you are: you start on the quay beside the map's harbour berth, and when you come back to a map you're where you left her, moored or afloat, aboard or ashore (`&start` on the address starts at the harbour again); Oban and Lorn, Tayvallich and Loch Sween, the island of Syros in the Cyclades, and the whole Firth of Clyde (35 by 37 km with every harbour in the map data; its detailed shore loads round you as you sail). Their towns are built from the map's own buildings: cottages, terraces with painted fronts, churches, warehouses on the quays, windows lighting up at dusk; and their woods are planted from the map too: conifer plantations in rows, birch and oak woods, gorse, Syros's pines and olives, the woods on the far hills reading as forest from the sea; and their harbours are busy: creel boats and yachts along the pontoons and quays (caiques on Syros), fields of yachts on moorings swinging to the wind, a few at anchor showing their lights at night (solid: nose into one and you stop; a berth with a boat in it isn't yours to make fast in); their fish farms (cage rings, or lines of mussel floats, with flashing yellow marks at the corners: solid, and on the chart) and their skyline: castles, church towers (white chapels with blue domes on Syros), masts with red lights at night, and wind turbines turning to face the wind, their red lights flashing together after dark (on the paper chart too, as a chart marks landmarks); their landmark structures from the map: Connel Bridge's steel cantilever over the Falls of Lora, McCaig's Tower's ring of arches on the hill above Oban; their shores are what the map says: pale sand only on the mapped beaches, grey shingle, rock and dark cliffs, a weed-brown foreshore where the map says nothing, greener fields on the low ground; a boat with a bow ramp (the landing craft) can run up a sand or shingle beach unharmed (under about 6 knots), and with her ramp down and slow she lands there and is held, so you can walk off down the ramp (go astern to come off), but rocks hurt as ever; their names are on the charts as a chart letters them (bays and sounds in sloping blue, islands in capitals, towns and villages upright; the chartplotter shows fewer as you zoom out, only the towns at the widest), and the radio's rescue, tow and fire calls say where in words ("in Rothesay Bay", "off Toward") before the bearing; their ferries sail the real routes: big drive-through ferries in the Clyde and Hebridean colours (black hull, white upperworks, red funnel with a black top) between Rothesay and Wemyss Bay and out of Oban pier to the islands, small double-ended ferries on the short crossings, passenger launches, the Aegean's white island ferries at Syros; each slows into port, lies at the linkspan a while and calls on the VHF leaving and arriving ("Ardlamont, leaving Rothesay for Wemyss Bay."), lit up at night, shown with her name on the chartplotter (AIS); she keeps her course and expects you to keep clear, but stops rather than run you down, and she's solid; with your engine off in a swell you hear the surf on the shore near you, from its direction and in time with the waves: booming on rock, rattling on shingle, washing on sand, quiet in a sheltered bay and gone when the engine starts; on these maps the overhead chartplotter draws the coastline and the shallows from the ground itself, sharp at every zoom (a moment after a part of the map first comes on screen, its blurry overview sharpens). **Chartplotter zoom** (every boat with one): three buttons under its screen, **−**, **AUTO** (amber) and **+**. − and + step the range across the screen from 250 m out to 32 km (the screen says which, top left); AUTO goes back to choosing it for you. The zoom is the boat's, so your crew see the range you set; later, several boats in one multiplayer game) and **Training** (later: small harbour maps with recording and review). Old links straight into the game, and shared game links, still work: the front page sends them on to the career game.

**Status:** everything up to 23 October 2026 is in the live game ([what's new, 21 to 23 October](docs/RELEASE_NOTES_2026-10-23.md); [what's new since v1.0](docs/RELEASE_NOTES_next.md) and [on 21 October](docs/RELEASE_NOTES_2026-10-21.md) before that; the [v1.0 notes](docs/RELEASE_NOTES_v1.0.md); tag `V1.0` is the restore point before it). The MVP snapshot lives on the `mvp-1` branch. The code repository keeps its working name, SWVR. See [`PROGRESS.md`](PROGRESS.md) for what's done, what's next and known issues. Feature ideas and their status are in [`ideas.md`](ideas.md).

What's in the MVP:

- **A moderate Gerstner sea**, with physics and rendering sampling the same surface.
- **A 12 m displacement workboat** floated by strip-theory hydrostatics. It has a slow-revving diesel, gearbox and prop, a rudder and prop walk.
- **A walk-in wheelhouse**, a ladder to the roof, and grab-the-world locomotion.
- **Physical bridge controls** (wheel, throttle/gear lever, start/stop, horn, nav-light switch) with live instruments.
- **Nav lights** with proper arcs of visibility, exhaust smoke from a little model of the combustion (black when she's lugged or the throttle's snapped open on a turbo, white cold, blue worn), and synthesised engine and horn audio.

Since the MVP:

- **VR wrist menu.**
- **Fuel and engine temperatures:** an engine monitor, alarms and refuelling.
- **A small archipelago** with three kinds of port (see below), groundings and collisions, an anchor and windlass, sheltered water and an echo sounder.
- **Cargo runs** between the ports, with real deadweight.
- **Wake and spray:** foam that rides the swell, a prop wash astern on a high throttle (even pulling slowly, as a tug does), a wider, whiter wake and sheets of spray when a boat planes, spray when the bow slams, and water and splash sounds.
- **Wind on the sea:** white horses from force 4, and faint streaks along the wind from force 6.
- **Surf on the beaches:** waves break as they shoal, white water and a line of wash along the sand, more the bigger the sea.
- **A moon** lights the night: its disc, the clouds, a glitter path on the sea and soft shadows; cloud dims it.
- **Pixel painting:** crisp low-resolution detail on the boats: non-slip decks, black window frames, wood-lined wheelhouses, floor matting and a chequer-plate engine hatch.

## Play it (no install)

Open this URL in the Quest 3 browser (or any desktop browser) and press **Enter VR**:

**https://tartanski-cpu.github.io/SWVR/**

The site redeploys automatically on every push to the development branch, about 1–2 minutes after the push. Check progress under the repo's **Actions** tab.

### One-time GitHub Pages setup (repo owner)

1. On GitHub, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. Re-run the latest **Deploy to GitHub Pages** workflow from the **Actions** tab. Pushes after that deploy on their own.
3. If the deploy job says the branch is "not allowed to deploy to github-pages", go to **Settings → Environments → github-pages → Deployment branches** and add `claude/admiring-dirac-v9wwih`. You can also make that branch the default.

## Controls

### Desktop (development)

Keys are bound by **physical position**, so they work the same on QWERTZ (German), QWERTY and other layouts. The on-screen help shows each key as printed on *your* keyboard; this works in Chrome and Edge, while Firefox shows US names. All bindings are in `src/core/keybindings.ts`.

| Key | Action |
|---|---|
| Click the view | Capture the mouse for looking (Esc releases it) |
| O | Menu, flat on the screen: the mouse is freed to hover and click it (O again, or a click beside it, closes it; click the game to take the mouse back). The same menu as in VR. With a game controller aiming, it floats in front of you instead: aim and click |
| Right mouse button or Z (hold) | **Binoculars**: 7x zoom through two lens circles (Z is the key left of X, so Y on a German keyboard). Over the chart, right-drag still erases. Holding the wheel or a lever, it's free look instead (below) |
| Y (hold) | **Wave:** your arm up over your head, swinging, for the crew to see. Overboard, it's how you call for the life ring (in VR, just wave your hand) |
| W A S D | Walk (walls, furniture and the deck edge stop you; hold Shift to **run**) |
| J | Debug: toggle walk / free-fly camera (Space / C = up / down when flying) |
| Space / C at the ladder | Climb up / down (walk off the top onto the roof, or a walked deckhouse top) |
| Space (elsewhere) | **Jump**: off the boat onto a quay, from a quay aboard, or into the sea. Swimming near the hull, the swim ladder or a quay: climb out |
| Click a cargo item | Pick it up (carried in front of you); click again to set it down |
| Q on cargo on deck | Lash it down where it stands / release it (anywhere on open deck, clear of the house and gear) |
| Middle mouse button (hold) | **Laser pointer** to the reticle (the beam comes from your lower right); the crew sees the beam and dot |
| Click the searchlight or fire monitor joystick, or the skiff's tiller or gear lever | Steer it with **W A S D** (you don't walk meanwhile) while the mouse still looks around; click again to let go. You don't walk while dragging a lever or the wheel either |
| Click the pod drives' helm joystick | **W A S D** lean it (she crabs sideways or creeps ahead / astern), **Q / E** twist it (she turns on the spot), **Space** presses JOYSTICK; click again to let go |
| **F** by the deck crane's post | **Take its radio remote** (and F again hangs it back): **W A S D** slew and raise / lower the boom, **← →** run the telescope in / out, **↑ ↓** hoist / lower the hook, **Space** hook. You stay where you stand while you hold it; the mouse still looks round. With a game controller: **A** takes it, left stick slew and boom, right stick telescope (sideways) and hoist (pull back) / lower (push), A hook, LB + right stick look, B hangs it back |
| Click one of the deck crane's joysticks | **W A S D** move that stick, **Space** hook; click again to let go |
| B | Board the boat (you appear at the helm) / go ashore onto the quay |
| Click the amber mark | **Step ashore** / **Step aboard**: with a boat moored, an amber ring over the quay's edge beside her (aboard) or over her deck (on the quay) |
| Aim **+** and click / drag | Operate the bridge controls (see below) |
| Holding the wheel or a lever, hold the **right mouse button** | **Look round freely:** the mouse turns your view and the wheel (or lever) stays where you left it, still in your hand; no binoculars. Let go of the right button and the mouse steers again. Off the wheel, the right button is the binoculars again |
| E | Debug: engine start / stop |
| **F** by the wheel | **Take the helm:** you stand at the helm facing forward, held there, and drive with the arrow keys or a **game controller** (below). F again leaves it. The wheel and lever still work by mouse |
| **Game controller** (Xbox and most others), at the helm | **Left stick** left / right: steer (the wheel follows the stick, back amidships when you let go). **RB / LB:** throttle up / down (it stops at neutral on the way through). **B:** neutral. **Right stick:** look round. **D-pad:** up heaves the anchor up, down lets it go; right the wipers on / off; left the horn (hold). **Left stick click:** searchlight on / off. **X:** fire pump on / off. **Right stick click:** laser pointer (hold). **A:** take the helm / leave it (as F) |
| **Game controller**, off the helm | **Left stick:** walk (click it in and hold to run). **Right stick:** look round. **A:** jump (by the wheel: take the helm). **B:** crouch. **X:** lash / release cargo. **Y:** board / go ashore. **RT:** use (as the left mouse button: press, grab, pick up). **LT:** binoculars (hold). **Right stick click:** laser pointer (hold). **LB:** wave (hold). **RB:** hang the extinguisher or torch back. **Menu:** the menu. **View:** talk on your handheld VHF (hold; at the helm too). The browser only sees the controller once you've pressed one of its buttons |
| **Game controller, at the helm: camera views** | **Y** cycles the view: **at the helm** (as usual), **orbit** (a camera a couple of boat lengths off, astern of her, turning with her; the **right stick** swings it round and up or down, **RT / LT** zoom in and out: for docking), **flyby** (a camera put down ahead of her and off to one side; she sails past it and it watches her go, then it's put down ahead again on her other side; RT / LT zoom the lens). Leaving the helm puts you back inside. Desktop only; nothing to do with the recording camera |
| W / S (at the helm), or ↑ / ↓ | Throttle/gear lever ahead / astern (neutral to full in about a second). Holding the key stops at neutral: let go and press again to go on through. Steer with the wheel (drag it), or ← / → |
| ← / → | Debug: wheel to port / starboard |
| X / G | Debug: lever to neutral / wheel amidships |
| T | Hydrostatics + sea trials report |
| L | Weather: switch to the next preset (Clear / Overcast / Fog / Rain / Squall), changing over a minute |
| 9 / 0 | Motion coupling −/+ 10 % (desktop has its own setting, 30 % by default: the view soaks up the boat's quick roll and heave; in the wheelhouse or with the reticle on a control it rides rigidly with the boat, so the console holds still to click) |
| R / K | Test: drop the boat from 4 m / heel her 20° and release |
| V (hold) | Talk on your handheld VHF: crew-mates within a few kilometres hear you on their radios (multiplayer) |
| F4 | Buoyancy debug view on/off |
| N / M | Time of day −/+ 30 min |
| F3 or I | Debug overlay on/off (FPS, cpu/gpu frame time, draw calls, boat readouts); off at start |
| P | Wave surface probes on/off |
| F1 or H | Help panel on/off (hidden at the start; it lists the playing keys, the rest is on the menu) |

### Phone or tablet (touchscreen, first version)

On a touchscreen the game puts you at the helm with on-screen controls (hold the phone sideways):

- **Throttle:** the slider on the left. Up is ahead, down is astern, with a neutral notch in the middle.
- **Steering:** the slider along the bottom right. It stays where you leave it; **MID** centres it.
- **Buttons, top right:**
  - **Board / Go ashore;**
  - **Start engine / Stop engine** (one press does the whole start-up);
  - **Cast off / Moor here;**
  - **Menu;**
  - **Switch to** the other boat (starts again in her).
- **Looking round:** drag one finger anywhere else on the screen.

Tap once for sound. Add `?touch=1` to the address to try these controls on a computer, or `?touch=0` to hide them. Single player only on a phone for now.

### VR (Quest 3)

| Input | Action |
|---|---|
| **Grip** with your hand on the throttle lever or wheel | Grab it; it follows your hand (not where the controller points). Two hands work on the wheel |
| (While holding a control) | The sticks don't walk or turn you, and the other hand doesn't pull you along, so you can't drag the lever by moving. Take your hand away (more than 25 cm) and it lets go with a buzz |
| Messages | Shown on a card low in your view for a few seconds, word-wrapped, with a short buzz in the left hand |
| **Trigger** touching a button or switch | Press it (start/stop, horn, nav lights) |
| Trigger pointing at a button or switch a little out of reach | Pointer-ray fallback for buttons and switches only (a blue line shows the target) |
| **Grip** on empty air + pull | Move (grab the world) in any direction, up and down too, through the wheelhouse walls, but not out over the side: a fence at the boat's edge stops you (and the stick) at the bulwarks. To go over the side, jump (A). Wherever you pull yourself to, you stay at that height until you teleport, board or jump, so seated play works without crouching. Two grips + twist: turn. In the water these are your swimming strokes |
| **A** | **Jump** (off the boat, onto a quay, into the sea) |
| **Hand gestures** (a hand holding nothing) | **Grip**: a fist. **Grip, then push that hand's stick forward**: point. **Grip, then pull the stick back**: the middle finger. The finger stays out until you let go of the grip; while you hold the grip on an empty hand, its stick doesn't walk or turn you. You see your own hands (the mitts crew-mates see on you, in your outfit) where your controllers are, and crew-mates see your gestures |
| **Right stick click (hold)** | **Laser pointer** from the right controller; the crew sees the beam and dot |
| **Grip** on a cargo item | Pick it up; it follows your hand. Items over 60 kg need both grips on them. Let go to set it down: on the deck over the boat, ashore over land, lost in the sea |
| **Trigger** touching cargo on deck | Lash it down where it stands (orange straps) / release it |
| **Grip** on the gunwale or transom while swimming | Haul yourself aboard (A near a quay climbs out there) |
| **Grip + pull down at the ladder** | Climb (aft face of the wheelhouse, up to the railed roof; or a Shipyard boat's ladder up to her walked deckhouse top). Push up to climb down |
| **Y** | **Menu** on your left wrist (see below) |
| Left stick | Walk (head-relative; can be switched off in the menu). Push it right to the edge to **run** |
| Right stick ← / → | Snap turn (30° by default; 15/30/45/90° in the menu) |
| Left stick click | Board the boat (at the helm) / go ashore onto the quay |
| Trigger, pointing at the amber mark | **Step ashore** / **Step aboard** (a free hand): with a boat moored, the ring over the quay's edge beside her, or over her deck from the quay |
| **Grip** the boat hook (port bulwark) | Take it; it points along your controller. Touch a floating crate or a tow's bow eye with the tip to hook it. With **auto-extend** (menu Comfort → Boat hook reach, on by default) it telescopes out to whatever you point it at, up to 8 m, then slides back in with the crate on it. Bring the crate alongside, then **grip the hook's pole with your other hand** (or reach over the side towards the crate and grip) to lift it aboard; set it down on deck. Lost crates carry no light: at night, look for them with the searchlight. Desktop: click the hook, then click the crate or bow eye; click again once it's alongside to lift it |
| **X** | **Crouch** / stand up (drops your view and hands 0.6 m; desktop: C) |
| **Trigger** on the red key on the yellow plate (aft wall, by the door) | **Battery master** on / off. The boat starts cold and dark: master on first (voltmeter by the helm, under the starboard window) |
| **Starting the engine** | Follow the card by the key: battery MASTER on (aft wall), INSTR breaker on, throttle in neutral, KEY on: the oil-pressure buzzer sounds and the GLOW lamp lights while the glow plugs preheat on their own. Wait for the GLOW lamp to go out (about 2.5 s cold, well under a second once the engine is warm), then hold START until she runs; the buzzer stops when she does. Stop: key off. Battery selector (1 / BOTH / 2) beside the master. The duty board on the starboard wall ticks off the start-up steps, and lists the jobs on: the cargo job, and any rescue or tow under way. Desktop E: hint (or quick start if enabled in config) |
| **Trigger** on a breaker (panel by the helm, under the starboard window) | Breakers: Instruments, Chart, Radio, Nav lights, Deck lights, Bilge, Deck hydraulics (DECK HYD). A device works only with the master and its breaker on; a green lamp shows the circuit is live |
| **Trigger** on a green **skiff crane** button: SKIFF CRANE on the helm console (DECK group), the crane's control box (outboard side of its post, from the starboard side deck), or the remote on a post in the skiff by the helmsman. Or Menu > Boat > Skiff | Launch the skiff / recover her (she must be alongside the starboard bow and moving with you). Its hover text says which, or why not yet. In the cradle she's under a tarpaulin (launch her before boarding) and the crane is folded down along the starboard foredeck; LAUNCH unfolds it, hooks on and lifts her out |
| **Trigger** on the green button on the **deck gate**'s aft post (starboard side of the working deck, just aft of the wheelhouse; a button on each face) | Open / shut the gate in the bulwark and rail. Open, you can walk out to the deck edge in the gateway and jump down into the skiff alongside; from the skiff (there's a step on the hull side below it), jump at the open gate and you're up on deck |
| **Trigger** on the skiff's **bow cleat** (on her stem head) or **stern cleat** (on her port quarter) | That end's line: let it go if it's fast. Otherwise, lying slowly alongside a quay berth, it goes **ashore** to the bollard, and with both ends ashore she's moored there, like the big boats. Anywhere else it goes to the nearest of the ship's cleats within 6 m (the bow line is her **painter**), so you can tie her alongside fore and aft. She goes into the water already on her painter, made fast to the forward starboard cleat, so she can't blow away. Trigger on a **midship cleat** (just aft of the wheelhouse, each side) to lead the nearer of her free lines there while you work cargo over the side; again to let it go. A hard pull (towing her off at speed) parts it |
| **Grip** on the skiff's tiller, then **trigger** | Steer by swinging the tiller; the same hand's trigger is the throttle (let go = idle). Red button on the motor: on/off; yellow lever on its side: forward / neutral / reverse |
| **Grip** the radio high on your left shoulder (with voice chat on) | Take your **handheld VHF**; hold that hand's **trigger** to talk on it (its red light comes on). Crew-mates within a few kilometres hear you through their radios. Let go of the grip and it clips back on your shoulder. You can't see it there: reach up by your left shoulder, and a tick in the controller says your hand is on it |
| B | Debug/perf panel on your left wrist (off at start): FPS, cpu/gpu frame time, draw calls, XR resolution, boat readouts |

### VR menu (Y)

The menu stands above your left hand. Use the **right** controller on it in one of two ways:

- **Poke:** push the tip of the controller into a button.
- **Point:** aim the ray (an orange line) and pull the trigger.

While your right hand is on the menu, its trigger doesn't reach the bridge controls behind it. If the left controller isn't tracked, the menu floats in front of you instead.

The menu is laid out for playing. Some tabs have sections, picked from a second row under the tabs.

| Tab | What's on it |
|---|---|
| Voyage | The job you're on (contract, cargo run or rescue, with **Abandon**), what you've done; the **weather** now and what's coming; time of day ±1 h and time flow stopped / ×60 / ×600; bearing and range to each port (a scrolling list: ▲ / ▼ at its side, or the mouse wheel), and in Voyage mode a **Go** button per port that puts your boat there, at its cargo berth or in its bay; the paper chart's marks, with **Clear marks** |
| Boat | **Favourite:** the boat you're aboard, and **Save her** to put her in this browser's Shipyard favourites (so a crew-mate's boat you like can be launched again, from VR too; she's then in Crew → Your boat and Office → Your boats). **Deck:** tow (**Make fast** / **Cast off**), docking (**Dock** / **Cast off**), anchor status. **Skiff:** board, **LAUNCH** / **RECOVER**, battery. **Fuel** and **Refuel** (at a fuel berth). **FM radio:** power and station |
| Cargo | Where you are, payload, deliveries; cargo aboard (lashed or loose), and what's in the skiff (up to three crates or two drums, 250 kg) |
| Office | **Jobs:** balance, the contract on, the harbour office's job board, the first voyage (**Skip** / **Again**). **Career:** balance, reputation, ledger, the three save slots |
| Crew | Multiplayer, in the order you need it: **Host a game**, or type a game code to **join** one (the box starts empty each time); then **Aboard**: everyone in the game, the host marked, with a **Mute** button by each crew-mate (their voice silent to you only); your name, voice chat and microphone; in Voyage, **Your boat** (launch one of your own); the recording camera last |
| Settings | **Comfort:** motion coupling ±10 % (how much of the boat's roll, pitch and heave your view follows: 100 % rigid to the deck, 0 % the horizon held level; each step in between lets about 10 % more of her motion move past you), stick walking, snap-turn angle, boat hook reach. **Sound:** volumes. **Game:** rain effect, rescue position (on the plotter, or plot it yourself), **Trees** (on the coast maps: **Auto** picks for the device: far trees on a desktop, out to 3 km, and nearer ones on a Quest; beyond the trees the woods are painted into the ground's own colours, so they read to the horizon; or choose **Near (Quest)** / **Far (desktop)**), and the **Debug tab** (hidden / shown). Remembered on the device |
| Debug | Hidden until **Settings → Game → Debug tab → Shown**. **World:** time ±10 min, **weather by hand**: press any stop on the **Wind** (knots), **From**, **Rain** or **Waves** (Hs, m, up to the game's biggest sea) rows and the weather is yours, in at once and held until you press **Live weather** (Voyage; **Game's own** in the career) to give it back; **Fast ×10**; move to a port, board / leave the boat. **Boat:** **Start in** the game's own boats, each designed in the Shipyard (the **fast landing craft**, about 30 knots, her narrow wheelhouse set high with its windscreen raked forward; the **fishing boat**, a gillnetter with a rod rack, side decks wide enough to walk past her wheelhouse and a forward-raked windscreen; the **pilot boat**, the owner's own "Pilot boat 11.2 m": an 11.2 m aluminium deep-V with a faceted hull and sheer, twin V8 diesels driving **pod drives**, with the black throttle and the **helm joystick** for berthing, about 36 knots, a side door, a searchlight and fire monitor on her roof, a chart table, stern roller and rod rack, a rubbing strake and fenders; the **small tug**, with a tow winch, stern roller and Kort nozzle, her exhaust stack (one per engine) up through the aft corner of her wheelhouse and out of the roof, upright with its top part bent aft, or straight (a Shipyard choice: Engine step, Exhaust stacks), the smoke from its top, her cooling water spitting from a hole in her side; and the **beginner boat**, the fishing boat as basic as she comes, about 8 knots; you can open each one's design file in the Shipyard), or the **Alaskan 38** (on the test address only for now: a one-off 12 m aluminium expedition boat with twin outboards on a bracket, a raised pilothouse with tinted glass under a tan eyebrow, two steps down into the saloon (galley, dinette with the chart table) under a lower roof that runs aft over the cockpit, a companionway beside the helm down to the fore cabin, 26 knots). The old workboat and landing craft are hidden (replaced by the fleet). **Second boat:** one of the fleet put afloat beside yours (host or alone): walk or jump across to her, or press the board key near her, and she's your boat: her dash, sounds and gear, until you board another. Also: drop 4 m, heel 20°, damage, **On a slip** (a bow-ramp boat landed on the nearest slipway), electrics, start-up, oil, bilge, engine faults, sea trials. **Missions:** rescue, tow, fire, side jobs and traffic on demand, +£5000. **Views:** perf panel, buoyancy, wave probes, targets on the chart, radio voice test. **World → VR fly** (in the headset): the left stick flies where you look, up and down too, through everything; hold one trigger to go fast, both to go very fast; the right stick still turns. Switch it off and you drop from wherever you are |

### Bridge

At the helm, from left to right on the console:

- **Nav lights** toggle switch.
- **Anchor** switch: down = let go (the chain pays out 5 × the water depth: 20 m in 4 m of water; the echo sounder shows the depth *under the keel*, about 1 m less than the water depth), up = heave in and stow. You hear it: the chain rattles out over the bow roller and the anchor splashes in; heaving in, the windlass hums and the links clank in one by one, with a clunk as it stows.
- **SPOT** switch (far left): the searchlight on the wheelhouse roof.
- **Pod drives' joystick** (a boat built with pod drives): the black throttle and, aft of it on the same pedestal, a black helm joystick with a blue **JOYSTICK** button beside it. With the throttle in neutral, press JOYSTICK (it lights): the wheel and throttle stand aside and the stick drives her. **Lean it sideways and she crabs that way** (to come off a berth or onto one), **forward or back and she creeps ahead or astern**, **twist it and she turns on the spot** (clockwise to starboard). She holds her heading by herself while she crabs or creeps. A small lean is gentle (the engines idle, the pods' clutches slip); further, the engines open up a little. Let go and she stops pushing. Press JOYSTICK again, or move the throttle, and the pods are back on the wheel. In VR, grab the knob: lean your hand to push, turn your wrist to twist.
- **Searchlight joystick:** on the pedestal to port of the wheel, under your left hand. Grip it and push sideways to pan, forward/back to raise/lower the beam. The further you push, the faster it moves; let go and the light stays put. On desktop, click and drag it. The lamp is **stabilised** like the fire monitor: it holds its aim as she rolls and pitches, so the beam stays on what you've found. It only does this while it's lit; switched off it sits still on its mount.
- **Cabin** light switch: the wheelhouse ceiling lamp, three-way. Each press steps **off → white → red → off**: the bat is in the middle for off, forward for white, and aft for red. Red is dim, for night work: you can see the controls without losing your night vision.
- **WIPERS** switch (far port end): the three pendulum wipers on the front windows. They need the INSTR breaker; switched off they finish the sweep and park.
- **Horn** button (hold).
- **Wheel**: 1.5 turns lock to lock. Hydraulic steering, so it stays where you leave it.
- **Throttle/gear lever**, on a pedestal starboard of the wheel so it falls to hand: forward = ahead, back = astern, with a notch at neutral.
  - **Big engines (the landing craft and Shipyard boats) have a trolling valve:** the first part of the lever's travel either side of neutral keeps the engine at idle and lets the gearbox slip, from dead slow (2 to 3 knots) up to her idle speed in gear; past about a third of the travel the throttle opens. The workboat's lever opens the throttle straight from the notch.
- **Start/stop** button. The engine only starts with the lever in neutral.

**Helm assist panel** (a Shipyard choice with the Advanced controls; on the fleet's landing craft, fishing boat, pilot boat and small tug): a small box on the starboard wall beside the breaker panel, with three buttons:
- **AUTO START** (green): the whole start-up in one press: battery master and breakers on, engine started.
- **DOCK** (blue): what the menu's Dock / Cast off does: both lines ashore at the berth in range, or cast off.
- **AUTOPILOT** (amber, lit while it's on): holds the compass heading she's on when you press it, steering by itself (you'll see the wheel move). Press again to let go. Turning the wheel yourself also lets it go, and it needs the INSTR breaker on.

**Instrument lighting:** the dials, screens, labels and the start-up card dim by themselves as it gets dark, and at night turn a dim red, so you keep your night vision and still see out. The switch and button labels are tilted up toward you so they read from the helm.

Warning lamps in front of the key: **OIL** and **CHARGE** (lit with the key on until she runs), **GLOW** (lit while the glow plugs preheat), **NEUTRAL** and **BILGE** (blinks with water in the bilge).

**The console, port to starboard.** The switches are grouped on colour-coded plates:
- **LIGHTS** (yellow): nav lights, cabin light, wipers.
- **SEARCH · FIRE** (red): the fire pump and searchlight switches, each just ahead of its joystick. The fire monitor joystick (red knob) and the searchlight joystick (yellow knob) stand side by side on pedestals to port of the wheel: aim with the left hand, keep the throttle in the right.
- The **horn**, just left of the wheel.
- **DECK** (blue): anchor and trawl, behind the throttle.
- **ENGINE** (green): START, the key, the warning lamps, and the start-up card.

### Chart table

The chart table is a drop leaf on the port wall, behind the helm. Press the wooden **knob** on its front edge to fold it down flat against the wall (the leg swings up under it), out of the way; press it again to lift it back up. Folded, the chart still faces into the wheelhouse so you can read it, but you can only draw on it unfolded. On it:
- a paper chart of the sound (north toward the wall);
- a pen holder with the pen, a pencil and an eraser;
- dividers.

Above it, a lamp on the wall with its own small switch on the wooden batten the leaf hangs from (DECK LTS breaker).

**Drawing on the chart:**

| | VR | Desktop |
|---|---|---|
| Pick up the **pencil** or **eraser** | Grip near it (let go: it goes back) | (not needed) |
| Draw | Touch the chart with the pencil tip; lift it off to stop | Aim at the chart and drag |
| Straight line | Hold the trigger while drawing (from where you started) | Hold Shift while dragging |
| Erase | Rub the eraser on the chart | Right-drag |
| Clear the chart | Hold the eraser's trigger 2 s | Menu → Voyage → Clear marks |

- Marks are kept in chart coordinates, so a route you plot lines up with the real places. They show faintly on the chartplotter too.
- **The plotter's coastline is drawn from the ground itself** on every map, the career archipelago as well as the Voyage maps: land, beach and the shallows under 6 m are cut from the terrain's own triangles, so they stay sharp however far you zoom in. A region's outline appears once her view has built the ground as you near it; until then the plotter shows its coarser sampled picture.
- Marks are saved in the browser, so a route plotted before leaving is still there after a reload.
- In multiplayer, crewmates see the marks appear as you draw, and several people can draw at once.
- **Plot it yourself** (Menu → Settings → Game → Rescue position, or `rescue.plotYourself` in the config; off by default): rescue calls give only the last known position in latitude and longitude, and the chartplotter doesn't show the search area. Plot it on the paper chart, using the latitude and longitude scale on the chart's edges.

- **Reading it on desktop:** aim the crosshair at the chart from the table and the view eases in, as if you leaned over it; look away and it eases back.
- It's printed like a real chart: depth tints and contours, soundings in metres, a latitude and longitude scale in tenths of a minute around the edge, and a compass rose.
- **At night** you need the chart table lamp (or the cabin light) to read the chart. The chart, the whiteboard and the task board go dim and red after dark, like the panels, so they don't dazzle you. The chart lamp, a black gooseneck reading lamp standing on the table (a round base with a rocker switch, a long arching neck, a spot head aimed down at the chart), is turned down to a dim red at night. With the white cabin light on they stay whitish, but dimmed.

### Voyage planning table (Voyage mode)

On the quay where a Voyage map starts, a few steps behind where you begin, stands a big chart table for planning a voyage together. Everyone in the game works the same table and sees the same chart.

- **The keys** along its near edge pick what a press on the chart does: **Waypoint**, **Stop** (it takes the nearest harbour's name), **Look at** (it takes the name of the nearest castle, monument, tower, hill, wreck or light), **Remove** (the point nearest your press) and **Zoom in** (on the spot you press). **Zoom out**, **Whole map** and **Undo** work at once; **Clear** takes every point off when pressed twice.
- **Pressing the chart:** VR, point the controller at it and pull the trigger, or touch it with the controller's tip; desktop, click it.
- **On the chart:** the route joined up and numbered, stops as squares, things to look at as diamonds, the next point ringed, your boats as blue arrows, and what's next along the chart's foot.
- **Afloat:** every boat's chartplotter draws the route, and when no job wants you it steers for the plan's next point ("STOP 2 ROTHESAY 045° 2.3 nm"). When any of your boats gets there, everyone's told, and the next point comes up. The radio's rescues, tows and fires still come along the way.
- **Voyage tab → Voyage plan:** the next point and how far, and **Go to the table** to put you ashore beside it.
- **The table follows the host:** when the host takes her boat to another harbour with the Voyage tab's **Go**, the table goes there too, on that harbour's quay.
- The host's browser keeps the plan for each map, so it's there next time.

### Live weather (Voyage mode)

When a Voyage starts, the game asks Open-Meteo, a free weather service, for the real weather at that place now. You sail in it:
- **What comes in:** the wind and its direction, visibility, rain and cloud, and the sea as the marine forecast has it. That's where the weather starts: it then changes as the game's own weather does (a front, a squall, fog), and the forecast on the radio says what's coming. The real sea holds until the first change; then it follows the wind.
- **Where it's shown:** you're told as it comes in ("Live weather, Oban and Lorn 15:45: wind north-west 10 kn, gusts 18, overcast, sea 0.5 m"), and it's in the Voyage tab under Weather.
- **Offline**, or if the service doesn't answer, the game's own weather runs as before.
- **With crew:** they get the host's weather.

Weather data by Open-Meteo.com (CC BY 4.0).

### The timber run (Voyage mode, Oban and Lorn)

A loop with the Timber game. Cut logs ashore, then tow them to market.

1. **Find the bay.** A yellow buoy with a brown band marks the timber camp's anchorage in Ardantrive Bay, Kerrera, across the sound from Oban. On the chartplotter it's a dashed ring with an anchor, "Timber camp".
2. **Anchor there.** Stop inside the ring and let go the anchor. Once it's set and she's still for a few seconds, you go ashore: no question asked.
3. **Ashore:** the screen fades to black and the Timber game opens, in the same browser tab. Your voyage is saved first, anchored where you left her. In VR, the browser may drop you out of the headset view as the page changes; press Enter VR on the Timber page.
4. **Back aboard:** when you return from the camp you're on your boat, still at anchor. If you delivered logs, a barge with them stacked on her deck is lying off, already on your towline.
5. **Tow her to Oban.** Weigh anchor and tow the barge to the timber merchant at Oban's North Pier (a square on the chartplotter, "Timber merchant"). A full barge sits deeper and tows heavier.
6. **Sell.** With the barge alongside the merchant's quay and your boat stopped, you're offered the sale: logs × £12. Press Enter, or **Sell** in the Voyage tab. The money is this session's, not saved when you leave.

You can cast the barge off and make fast again like any tow. A barge you leave lying stays where she is, saved with the voyage. Then go straight back for another load: weigh anchor and let it go again in the bay (coming back from the camp you're anchored there already, and that doesn't send you straight back). The timber camp takes one player at a time: anchoring there takes you ashore only when you're playing alone or hosting with no crew aboard.

### Transit jobs and closing up

- **Fenders:** press the fender basket on the aft deck (starboard) to put all six out over the side, or take them in. Out, they cushion her against a quay: a knock coming alongside a bit fast does less damage to her hull (or none).
- **The roving fender** (any boat with fenders, once they're out): what a deckhand does coming alongside. The fixed fenders hang at their stations; whatever part of her is about to touch the quay (or another boat) between them, walk there, look at the quayside and press with an empty hand: desktop, the reticle on the quay says "click to hang a fender here", click; VR, point a free hand at it and pull the trigger. The fender is hung at your station on that side, and stays there until you hang it somewhere else or take the fenders in. Not with the boat hook in your hand: never push off with a hook or a foot, that's how legs get broken; hang a fender.
  - Coming up to a berth with them in puts "Coming alongside: fenders out" on the duty board.
  - Out of harbour with them still out gives "Under way: fenders in".
- **Lash the cargo:** under way with loose cargo on deck, "Under way: lash the deck cargo" comes up.
- **Engine oil:** the engine burns a little oil. Every 15 minutes of running, "Engine check: oil" comes up.
  1. Open the **engine hatch** in the wheelhouse floor, aft on the starboard side: press its yellow lifting ring and it swings up against the wall. The engine is below. While it's open you can't step into the hole; press the ring again to shut it. (On a Shipyard boat the hatch is wherever her engine is: in the deck forward or aft of the house, or in the cabin floor.)
  2. Pull the **dipstick** (yellow ring) on the engine's inboard side. It tells you whether the oil is fine or low. (The dipstick and the oil can only work with the hatch open.)
  3. If it's low, press the red **oil can** on its shelf beside the engine to top up through the yellow filler cap.

  Nearly dry, the OIL lamp blinks while running.
- **Wheelhouse door:** the aft door has a window and slides open or shut with the **green push button** on its starboard frame, inside and out (trigger in VR, click on the desktop). The door itself isn't a button any more, so it can't catch your hand at the whiteboard. It starts open, and when shut it blocks desktop walking.
- **Side door:** a second sliding door in the port side of the wheelhouse, between the helm console and the chart table, out to the port side deck. Its green button is on the forward edge of the doorway, inside and out. It starts shut. The wheelhouse is only shut in (quieter, out of the wind) with both doors shut.
- **Wheelhouse front:** pilot-house style, the front windows lean forward from the top of the instrument panel under a brow, and the side walls stand up to the console top beside it.
  - **Sound:** on deck the engine is at full noise. Inside the wheelhouse it's a little quieter and duller; with the door shut it's much quieter and duller. Shutting the door also muffles the wind, rain, hull wash and fires inside.

### Traffic and hazards

- **Passing ships:** four AI ships (coasters, fishing boats, yachts) are always about, crossing ahead some way off on deep-water tracks; a new one comes along when one has passed. On the Voyage maps too: in a bay or a loch they take the longest clear run of water about you (the coaster keeps to 8 m, a yacht gets by in 3) and alter course when it shoals ahead of them, or slip away where it ends.
  - They show on the chartplotter as **AIS** triangles with their name and a 6-minute course line, in any visibility.
  - They carry navigation lights at night.
  - The lookout calls each one out with a clock bearing and range.
- **In fog** ships sound a prolonged blast every 2 minutes, and the nearest one answers yours. Listen for where it comes from.
- **Hazards:** floating debris, and charted dangers marked with lit buoys (IALA region A, as round the UK):
  - **the wreck of the *Margaret Ann***, west of Gull Rocks, lying on her side with her wheelhouse and mast showing; a north and a south cardinal;
  - **Dubh Sgeir**, a reef awash further south-west; a west and an east cardinal;
  - **Craig Bheag**, a lone rock south of Gull Rocks with an **isolated danger** mark (black and red, two black balls, Fl(2) 5s) on it;
  - **Gull Rocks** (west and south cardinals) and **the Skerry** (west cardinal);
  - a pair of **lateral** buoys at the Calder entrance: red can to port, green cone to starboard, coming in.
  - Cardinals are yellow and black with two cone topmarks, and lie on the named side of the danger (pass north of a north cardinal). At night each flashes its own rhythm: N quick, E Q(3) 10s, S Q(6)+long 15s, W Q(9) 15s. All are on the paper chart and the plotter with their light characters.
- **Debug:** Menu → Debug → Missions → Traffic → **Spawn ship** / **Spawn debris** (close by).

### Emergency calls

Out of harbour, the VHF brings rescues (on cargo runs), tows and fires now and then: a tow call every 8 to 18 minutes, a fire every 10 to 22, and a rescue on about a third of cargo runs. An unanswered call rings every 20 seconds for two minutes, then goes to someone else. On desktop the calls are read out by your browser's voice. On the Quest (its browser has no voices) you hear the radio's static and click; the words are on the radio screen and in the notice.

To work in peace, set **Menu → Voyage → Emergency calls → Off (quiet)**. No new calls come while it's off; one already ringing runs its course. Shipping forecasts and harbour messages still come. Turn the RADIO breaker off for silence altogether, or turn the VHF down in Settings → Sound.

**Rescue calls** (on the test address) come in several kinds, each with its own call and its own search area: a **person in the water**; an **upturned dinghy** with two or three people spread around her; a **liferaft** with three or four sat on her tube; a **motor boat sinking** with two aboard, who go into the water in lifejackets if she goes down before you get there (about five minutes after the call); and **three divers** who surfaced apart, spread over a wide area. Survivors are built like the crew's avatars, in a lifejacket with its light. **The ring need not land on them:** a survivor within about 14 m of the ring swims for it (one at a time), so throw it near and haul when they've got it. People on a raft or a sinking boat climb straight aboard: lay your stern alongside, within about 4 m, and go to neutral; they come over one after another. The dinghy and the raft drift with the wind and tide as everything does.

### Weather work

- **Shipping forecast:** the coastguard reads it out on the VHF every 12 minutes and soon after the weather turns: wind, sky, visibility, and what's coming and when. You only hear it with the RADIO breaker on. The last one received stays on the **duty board** (starboard wall) with its time.
- **Rain:** drops build up on the front windows; the wipers clear them. They are pantograph wipers hung from the header above the glass, so each blade stays upright and clears a broad band at eye height, then parks upright by the window post. Rain drums on the roof inside and hisses outside.
- **Clouds:** the sky shows the weather. Fair-weather clouds on a clear day, a grey deck when it's overcast, dark heavy cloud in rain. The clouds drift downwind. **Watch the sky upwind** (where the wind comes from): about five minutes before the weather changes, the new weather builds there first. A darkening wall low on the upwind horizon means rain or a squall is coming; breaking cloud there means it's clearing. Then it spreads overhead as it arrives.
- **Squalls:** gloomy light, lightning flashes that light up the clouds, and thunder after them (count the seconds: about 3 s per km).
- **Deck hydraulics:** the skiff crane, the tow winch and the trawl's net drum are hydraulic, driven by a pump on the engine. They only work with the **engine running** and the **DECK HYD** breaker on. Without pressure a machine stops where it is and holds its load (the skiff hangs on the crane), and carries on when the pressure comes back. Press a machine's button without hydraulics and a note says what's missing. You hear each one working: the pump's whine, oil hissing through the valves, the drum or slewing gear rumbling, a clunk as the valve opens and closes, and the relief valve hissing when the winch stalls against too heavy a pull.
- **Bilge:** a damaged hull leaks (see damage below): the BILGE lamp blinks and the bilge pump (BILGE breaker) pumps it out.
- **Her condition:** two lamps on the engine panel, **HULL** and **ENGINE**, come on when she's worth a repair and blink when she's bad; the engine monitor shows both as bars with a percentage. Rubbing along a quay on fenders, a rubbing strake or tyres does her no harm (that's what they're for), except a little in a storm; hits on rocks, buoys, tows and quays at speed still do.
- **Duties** the weather puts on the duty board:
  - **Rain/Squall coming: secure the boat:** with loose cargo on deck, lash it (wipers on is optional).
  - **Restricted visibility** (under way in fog): nav lights on, and a prolonged blast on the horn (4 s or more) every 2 minutes until it clears.
  - **Bilge alarm:** BILGE breaker on and pump her dry.
- **Spotting:** the lookout calls out anything in the water as it comes within sight (900 m, or the visibility in fog), with a clock bearing. Survivors wave once they can see you; their strobe shows only a little beyond the visibility, but the whistle carries.

The dash shows:

- **Speed** (kn) and **depth under the keel** (red below 2 m), side by side, with heading, course over ground and the anchor.
- **Anchor** (a small screen beside the speed screen, on every Shipyard boat with an anchor; on a boat with the tow line it sits on top of it, the two sharing one screen's place): how much chain is out (m), with a bar against all she carries, and what the anchor is doing: **▼ LETTING GO** (flashing) while the chain runs out, **SET** (green) once it's holding, **DRAGGING** (flashing red) if it isn't, **▲ HEAVING IN** (flashing) while it comes up, **OFF BOTTOM** when it hangs clear (**NO BOTTOM** with all the chain out: too deep), and **HOUSED** once it's back in the roller.
- **Heading** (compass tape), with course over ground and **rate of turn** (degrees a minute, S or P).
- **Engine**: rpm, gear, engine state, load, fuel burn and coolant temperature, and the **rudder's actual angle** (the needle) against the helm's order (the ring), so you can see it catching up with the wheel. With outboards, stern drives or pod drives it shows their legs (DRIVES).
- **Tow line** (advanced instruments, on a boat that can tow: she has a stern roller; a strip, half the height of the other screens): the towline's pull in kN, and a bar of how near it is to **parting**: green, amber past half, red near breaking (EASE OFF). A white mark holds the highest load for a few seconds, so a sudden snatch still shows. NO LINE when nothing's made fast; PARTED when it goes. A steady pull, even flat out, won't part it: a tow that's stuck, a squall pushing you apart, or a hard snatch on a slack line will.
- **Rudder angle**: the needle is the actual rudder, the ring is the helm order (also in figures, top right).
- The **engine monitor**, behind the wheel (read it through the spokes): coolant and oil temperature, fuel litres and L/h, battery volts, and HIGH TEMP / LOW FUEL lamps. A buzzer sounds with the alarms.

The screens' lettering is a size smaller than it was, so each fits a little more; the switches and push buttons are a size smaller too (they're just as easy to press and aim at).

### Engine management

- **Fuel:** the tank holds 600 L. Flat out burns about 49 L/h; 6–7 kn about 11 L/h. Run dry and the engine stops; it won't restart until you refuel.
- **Cold start:** the engine starts cold and smokes white until it warms up, which takes about 5 minutes under way.
- **Smoke:** what comes out of the exhaust is worked out from the combustion. Warm and within her power there's only a faint haze. **Black** smoke is soot from too much fuel for the air: lugging (full throttle with the revs well down, worst on a turbo engine, which gives little boost at low revs) or snapping the throttle open on a turbo (a puff while it spools up). The V8s are turbocharged; the straight sixes aren't. **Blue** smoke is a worn engine burning its oil, most at idle. Smoke that won't clear is telling you something.
- **Overheating:** flat out and free-running she keeps cool: the governor eases the fuel as the load falls, and the raw-water pump is at full flow. **Lugging** overheats her: full throttle on a tow, or a hull that won't get up on the plane, holds the revs down with the fuel still full, so the pump turns slower and the engine runs hot and smoky. The alarm sounds at 95 °C, power is derated from 100 °C, and it shuts down at 115 °C. Ease the throttle and she recovers. The pump-failure fault (Debug) overheats her under any load.

### NAV / WIND display and binoculars

- **NAV / WIND** (overhead, just forward of the light switches; glance up from the wheel):
  - your position (latitude and longitude);
  - speed and course over ground, heading, depth;
  - the true wind (direction it blows from, knots, Beaufort force);
  - a dial with the apparent wind (what you feel on deck) relative to the bow.
- **FM radio** (the overhead set on the workboat; under the cabin roof to starboard on the landing craft and on Shipyard designs with the advanced controls; or menu → Boat): the music comes from the set, so you hear which way it is. Step out of the wheelhouse and it's quieter and duller through the walls, more so with the doors shut.
- **Binoculars** lie on top of the dash, port end. VR: grip them to pick them up and raise them to your eyes for a 7× view; let go and they go back. Desktop: hold the right mouse button (or Z). The view through them is steadied a little (it eases onto where you look over about a tenth of a second), since the zoom magnifies every tremor. In VR the lenses fill your view, black all round, and the picture through them reaches the full draw distance: while you look, the game draws only what the binoculars see.

### Fire extinguisher and torch

Both hang on brackets inside the wheelhouse, low on the aft wall in the starboard corner (by the battery master).

- **VR:** grip one to take it off its bracket. It stays in that hand while you hold the grip: carry it out on deck, into the skiff or ashore. Let go and it goes back on its bracket. The same hand's **trigger** works it.
- **Desktop:** click it to take it; you hold it low to your right, pointing where you look. The **left mouse button** works it (a click on a control still works the control). Click its bracket again, or press **U**, to hang it back.
- **Extinguisher:** hold the trigger (or the left button) to spray. The spray carries 5-6 m, so get close: alongside a burning boat, or ashore at a burning shed. You hear it hiss, and the fire sizzles and steams when you're on target. It knocks a fire down a bit slower than the fire monitor, and a charge lasts a minute of spraying. Empty, hang it back on its bracket and take it again for a full one.
- **Torch:** trigger or left click: on / off. A narrow, real beam that lights the water and whatever it falls on, for picking out someone in the water 5-6 m off or finding your way ashore at night. Crew-mates see your beam.

### Fire missions

Out of harbour, with no other job on, a fire is reported on the VHF every 5–11 minutes. It's either a fishing boat burning at sea, or a shed ashore that you can reach from deep water. Pick up the handset to take it; the plotter marks it **FIRE**.

1. **Engine running, FIRE PUMP on.** The switch is on the console, left of the wheel (SEARCH · FIRE group). The pump is engine-driven, so there's no water with the engine off.
2. **Aim the fire monitor** on the wheelhouse roof with its joystick (red knob, on its own pedestal at the port end, beside the searchlight's). Sideways pans it, forward and back raises and lowers it. It's **stabilised** while the pump is running: as she rolls and pitches it holds its aim (you'll see the barrel move on its mount), so you only correct for your own heading and the drift. The jet flies a real arc, carried by the boat's way and blown a little by the wind.
3. **Keep the jet on the fire.** You know you're on target four ways:
   - the **ON TARGET** lamp lights green on the console, just ahead of the monitor joystick;
   - the **FIRE** bar beside it shrinks as the fire dies, from red through orange to yellow;
   - you hear the steam **sizzle** where the water lands, even from the helm;
   - the smoke turns to white steam, and the coastguard calls your progress on the VHF (first water on it, under half, nearly out).

   Left alone, a fire grows. About a minute of steady hosing puts out a big one.
4. **Out:** the coastguard thanks you, and it counts as a mission.

The duty board walks you through it. The menu's Debug → Missions section has buttons that light one close by (Boat, Shore), raise a call, or end it.

### Towing missions

Out of harbour, with no rescue on, a tow call comes over the VHF every few minutes: something adrift a few hundred metres ahead. It comes in three sizes:

- **Small:** a broken-down motor cruiser, or an open fishing boat with a fouled propeller.
- **Medium:** a raft of logs, a work barge, or a dismasted 11 m sailing yacht.
- **A ship (tugs only):** a loaded 58 m coaster with her engine dead (1,060 t). Only a **tug** hears these calls: a boat with the slow-revving tug diesel, or the heavy towing post upgrade. A tug gets them about half the time. She passes her own heavy hawser (three times as strong as your line) and pays £6,500. Nothing smaller will shift her in any useful time. **Passing her the line:** her bow eye is too high and too far for the boat hook, so every tug carries a **line-throwing gun** on a bracket in the wheelhouse (starboard wall, aft; any Shipyard boat with the tug hull or the tug diesel). Take it, bring your stern within about 50 m of her bow, aim at her bow eye and press: a rocket carries a thin line across. Landed by the eye (aim within a few degrees of it, or the rocket passes close), her crew make it fast and haul your hawser over on it, a few seconds, and the towline is fast as if you'd hooked on. A miss splashes; the line winds in and the gun reloads in a few seconds. **She has to be berthed, not just brought in:** tow her to the harbour, cast off, then put your bow against her side and push her onto a quay or pier face. Once she lies slow alongside (her side within a couple of metres of the face) for a few seconds, the harbour's lines go ashore and the job is done; she lies there a couple of minutes before she's taken over. Your bow holds on her side now (boats have friction against each other), a push fender best of all.
- **Large:** an 18 m fishing trawler with her nets round her propeller (70 t), or a 20 m crane pontoon (123 t). These are slow, heavy work: they pass you their own heavy hawser (twice as strong as your line), but take up the strain gently and give yourself room to stop. Bigger tows pay more.

1. **Pick up the handset** to take the job. The tow shows as an orange **TOW** diamond on the chartplotter.
2. **Come alongside with your stern to her bow.** Our line leads from the tow winch aft over the **stern roller**, in a notch in the middle of the transom bulwark; her **bow eye** is the orange ring on her stem. **A tug** (any boat on the Shipyard's tug hull, the small tug among them) tows from a **towing hook** on a pedestal on her aft deck, near amidships, with her winch just forward of it. The line is still passed aboard at her stern, but it pulls on her at the hook. With a tow off to one side, she still answers her helm: towing the pontoon with her helm hard over, she turns about four times as far as she would towing from the stern. A tug's wheelhouse is always forward: in the Shipyard it never goes further aft than amidships.
3. **Make fast:** take the boat hook, then touch the bow eye with its tip (VR) or click the bow eye (desktop). The menu's Boat tab has a **Tow → Make fast** button too. Our stern must be within 16 m of her bow. To **cast off**, do the same again with the line fast (hook on the bow eye), or use **Tow → Cast off** on the menu.
4. **Tow her into any harbour.** The line goes out 22 m and is stretchy. Take up the slack gently: snatching it at speed (or dragging her over rocks) parts it, and you have to go back and make fast again.
   - **The tow winch** just forward of the stern roller works the line by hand (engine running and DECK HYD on). The line is made fast at the distance to the tow plus a metre, so heaving in starts bringing her closer at once: hold **HEAVE IN** (green) or **PAY OUT** (amber) on top of its gearbox housing (starboard end), standing forward of it facing aft. It comes in at 0.6 m/s and goes out at 1 m/s, from 4 m to 60 m, and stays where you leave it. Heaving in against a heavy pull (over 18 kN) stalls it: ease off or slow down. The status line shows the line out and its pull.
5. **Slow down inside the port** for a few seconds and the harbour takes her over. The tow counts as a mission, and she is taken away a few seconds later.

Unanswered calls go away after two minutes. The menu's Debug → Missions section has buttons that put a tow just astern (**Small**, **Medium**, **Large** or **Ship**: a kind of that size at random), raise a call, or end the job.

**Push off with the boat hook.** Put the hook's tip against a quay, a pier or the shore and press the trigger (VR) or click (desktop): the boat gets a shove along the hook, away from it, at your hand. Press again to push more. A light boat moves off at a walking pace in a few pushes; a 60 t tug barely moves, so it takes a great many.

**Tow anything in the water.** The towline isn't only for tow jobs. Make it fast the same way (hook or menu) to:
- **any boat afloat**, at her bow, e.g. our own skiff once she's off the crane;
- **floating debris** (the planks-and-drum hazards). Towed slowly into a harbour, it's cleared away, and the harbour thanks you.

One thing at a time on each boat's line. The menu's **Tow → Make fast** picks the nearest thing within 16 m of the stern roller. Floating crates from lost cargo still go on the boat hook, not the towline.

**Several boats on one tow** (multiplayer, with crew-mates in their own boats; or Debug → Boat → Second boat). Every boat with a stern roller has her own towline, made fast the same way, and any number can be on the same tow, debris or log: their pulls add up. The first line goes on the tow's bow eye; a second boat's goes on the **bow fairlead on her side** of the tow, so the lines run nearly parallel. Each boat's status line says how many others are on her too, and a boat without her line on is told the tow is under way and she can add her pull. What it buys depends on the tow:
- **A heavy tow** (the coaster, a pontoon) is held back by her own weight and the pull: two boats get the coaster going much faster (in tests, 2.6 m/s a minute after full ahead against 1.5 with one).
- **A light tow** (a barge) is already towed about as fast as the boat herself goes: a second boat adds little.
- **Steer:** two boats side by side on one tow sheer apart if left alone. Each line pulls her stern in toward the tow and swings her bow out. Hold your course with the wheel, and keep a bit of room between the boats.
- **In tandem:** a boat can also tow the boat that's towing (make fast to her bow eye, ahead of her): the two pull in one straight line. Take up the strain gently; a snatch on a heavy tow parts the line.
- **Pushing:** two tugs with their bows on a ship's side push her together (in tests, 27 m sideways in a minute against 17 with one), e.g. to lay the coaster alongside a quay.

### Career: money, reputation, contracts, upgrades

Everything you do now earns or costs money. The menu's **Office** tab is your harbour office: **Jobs** (contracts) and **Career** (balance, reputation, ledger, save slots); add-ons, upgrades and repairs are at the **boatyard** (below); the **duty board** shows your balance (top right) and any contract on.

- **Pay:**

  | Job | Pays |
  |---|---|
  | Cargo | £60 + £50 per km between the ports |
  | Fish | £45 a box |
  | Salvage log | £180 |
  | Debris cleared | £40 |
  | Lost crate brought in | £80 |
  | Tow | £450–800 |
  | Rescue | £400 + £150 per survivor |
  | Fire put out | £650 |

  A pop-up on the desktop shows each payment.
- **Costs:** fuel at £1.60 a litre (billed when you stop refuelling), a can of engine oil £35, and cargo lost overboard £100. You can go into the red, but you can't buy upgrades on credit.
- **Reputation** at each port (0–100) grows with the work you do for it: deliveries to it, catch landed or logs sold there, tows, survivors and fires. Losing a port's cargo overboard, or failing a contract, costs some. Higher reputation pays better there, up to +50 % at 100.
- **Job board:** lie alongside a port's berth (or anchor in Selkie Bay) and its office offers two contracts:
  - deliver N cargo to it;
  - land N boxes of fish there;
  - sell N salvage logs there.

  Each has a time limit and a bonus. Bigger ones need reputation at that port (15, 40). One contract at a time; late or abandoned, it's failed. The offers change every 10 minutes.
- **The boatyard** on the Calder Haven quay, behind the berths: a shed, a yard crane at the quay edge and old boats laid up rusting round the shed. Walk up to the **board on the shed's front** (VR: point and pull the trigger, or touch it; desktop: aim and click), with her in Calder Haven. Its tabs: **Add-ons** (her equipment: fitting one starts the game again with her refitted), **Upgrades** (for the gear she has) and **Repairs** (the hull, an engine overhaul).

  | Add-on / upgrade | Price | Needs (best port reputation) | Effect |
  |---|---|---|---|
  | Trawl gear | £2,500 | 5 | The A-frame over the transom, the net on its drum and the TRAWL switch at the helm (the workboat) |
  | Skiff and her crane | £4,000 | 10 | The skiff (a rubber dinghy with an electric outboard) in her cradle on the foredeck, and the crane to launch her (the workboat) |
  | Searchlight | £1,500 | 5 | The searchlight on the wheelhouse roof, its SPOT switch and joystick at the helm (the workboat) |
  | Fire monitor | £3,000 | 10 | The fire monitor on the roof, the FIRE PUMP switch, its joystick and gauge: the fire calls come once she has it (the workboat) |
  | Fenders | £600 | — | Fenders along her sides and a basket of spares: knocks alongside land on them, not her hull, and you can hang one between her and the quay by hand (the beginner boat; the workboat has hers) |
  | Life ring | £400 | — | A life ring and a boat hook on the wheelhouse aft wall: the rescue calls come once she has it (the beginner boat; the workboat has hers) |
  | Radar | £2,400 | 20 | Debris and floating crates show on the chartplotter within 1.5 nm |
  | AIS receiver | £900 | — | Passing ships on the chartplotter, by name and course, in any visibility (without it, none) |
  | Bigger fuel tank | £1,400 | 5 | Her fuel tank 60 % bigger (the workboat: 900 L to 1,440 L): further between fills |
  | Heavy towing post | £1,500 | 10 | The towline takes 75 % more before it parts |
  | Bigger trawl | £1,800 | 10 | The net fills half as fast again (needs the trawl gear) |
  | Ice machine | £1,200 | — | Fish fetch 30 % more (needs the trawl gear) |
  | Crane motion compensation | £3,500 | 15 | The deck crane holds its hook steady as she rolls, pitches and heaves (a boat with a deck crane only; it needs deck hydraulics) |

- **Your first boat:** a new career starts in the **beginner boat**, the owner's own design: a 7.8 m gillnetter, the smallest the hull comes, on the 150 kW diesel driving a stern drive, with basic controls, rails, a stern roller to tow from and nothing else (no fenders, no life ring, no searchlight): cargo runs, towing and potting from day one. Fenders, the life ring (and with it the rescue calls), the searchlight and the fire monitor (the fire calls) once you can afford them: buy them at the boatyard, and the game starts again with her refitted (about two seconds; in VR, enter VR again). She never carries a skiff or the trawl gear. **Ports with no quay, only an anchorage:** anchor in the bay and swim the goods ashore (or use the menu's Unload); the goods' labels and the job offers there say so, and that a boat with a skiff lands them easier. **Careers started in the old workboat aren't carried over** (they're kept, untouched, for the main game); on this version you start afresh.
- **Your own boat in a Voyage game** (multi-boat, Voyage mode only for now): **Crew → Your boat → Launch** one of the fleet, a Shipyard favourite, or a pasted code. Alone or hosting, she **replaces** your boat where you are (the page starts again in her; a host's crew follow). As crew, she's a boat of your own: the host finds her a berth at the harbour whose quay face has room for her length, in water deep enough, clear of the other boats; if none has, she lies at anchor off the harbour (the biggest boats do). You're put aboard her; walk or jump onto any other boat and she's yours while you're aboard. **Hand her back** takes her away; leaving the game takes her with you. Joining a game, you're aboard the boat the host is on. The Voyage tab's **Go** sends your own boat to a harbour, with you aboard (crew: launch one first; the host's boat is the host's to send). Boats far from every player are simulated more cheaply (fewer stations, every other tick) and drawn without their wake, spray and small parts; within 150 m they move exactly in the waves, as before. The crew's boats show on the chartplotter in amber with whose they are, and the lookout calls one as she comes into sight. A fire is fought by every boat's monitor at once; the forecast is heard on any boat's radio; each boat sells her own rod catch. **Launch again** brings back the boat you had last time. Joining a host in a different boat no longer restarts your page. **You hear the crew's boats** where they are: her engine in her own voice, the rush of water as she goes by fast (her note rising as she comes at you and dropping as she passes), and her horn, so you can beep at each other (the nearest three within 700 m).
- **Saved:** your money, ledger, reputation and upgrades are kept in the host's browser between sessions; crew-mates see the host's career. You start with £500.
- **Debug:** Debug → Missions → Career → **+£5000, rep** (cash and +25 reputation everywhere).

### First voyage, career slots, playing together

- **First voyage:** a new career starts with the Calder harbour master talking you through one job over the VHF, step by step:
  1. step aboard;
  2. battery master on;
  3. INSTR breaker on;
  4. start the engine;
  5. head to Calder Haven;
  6. dock at the cargo berth;
  7. load a crate;
  8. deliver it.

  The duty board ticks the steps off, and there's a £200 welcome at the end. **Menu → Office → Jobs** shows the step you're on, with **Skip** (or **Again** to replay it).
- **Career slots:** three careers per browser (Menu → Office → Career → Slot 1 / 2 / 3), each with its money, reputation, upgrades, the boat's condition and the first-voyage step. **New career in this slot** asks you to press twice.
- **Playing together:** when you host, the duty board shows the **game code** for your crew to read off the wall. Menu → Crew lists who's aboard, and the last code you joined is remembered. Crew-mates play the host's career, in the host's boat: if it isn't the one they're in (a Shipyard boat, or the workboat fitted out otherwise), their game starts again in hers and joins again by itself (in VR, enter VR again). If the host changes boat while hosting (Start in, a Shipyard boat, a yard refit), the game keeps its code: the host's page starts again hosting it, and every crew-mate's page starts again in the new boat and rejoins on its own. Crew can't change the boat while aboard the host's; leave the game first. **One address:** once you host or join, the page's address carries the game code (`?game=12345`): copy the link to a friend and they join straight in; reload the page and you're back in the same game (the host's own tab hosts it again, and the crew wait for it to come back). Leaving the game takes it off the address. **If the host drops out** (their page dies or they lose the connection), the game carries on: after about twelve seconds the crew-mate who joined first takes over hosting under the same code, from where things were, and the others rejoin by themselves. The host's career plays on in the new host's game but is never saved on their side; if the old host comes back they join as crew.
- **The recording camera** (for filming, desktop): join the game on a desktop computer, then **Menu → Crew → Be the camera: On**. You're a small flying camera instead of a crew-mate (the others see a camera with your name over it). Record your screen with OBS or similar.
  - **Fly it:** the mouse aims it; W / S fly forward and back where it looks, A / D sideways, Space / C straight up and down, Shift faster; the mouse wheel zooms. It flies through everything.
  - **Options** (same menu): field of view, flying speed (slow / normal / fast), smoothing (eases the view for steady footage), **rides with the boat** (keeps its place on her, the picture always level) or **stays put** (set up a shot ashore or at sea as she passes), and **clean screen** (nothing on the screen but the picture).
  - **Handled like a GoPro:** a VR player grips the camera and it's in their hand, the camera's picture following it (about a sixth of a second behind, smoothed). It's locked to their hand until they let go; then it stays right there, riding with their boat (or put, as set). Picked up, it is **rigid in their hand**: it moves and turns exactly as the hand does, its lens looking out along it, so they aim it like a hand-held camera; **the trigger flips it** round in the hand to face them (a selfie), and back. A small **preview screen** above it shows them what it sees (it doesn't show yourself: you aren't drawn on your own side, only your hands; the camera's player sees you).
  - **Be the camera: Off** puts you back aboard at the helm. Sound for recording comes later.

### Damage, wear and weather

- **Hull damage:**
  - **What causes it:** hitting anything (rocks, a quay, the bottom) faster than about 2 knots, or grinding over the bottom under power. Normal docking does none.
  - **What it does:** a damaged hull **leaks** into the bilge. At about half damage the leak is faster than the bilge pump. Water in the bilge is real weight (a full bilge is 3 t), so a flooding boat sits deeper and handles heavier.
- **Engine wear:**
  - **What causes it:** running hot (coolant over 98 °C) or with the sump nearly dry.
  - **What it does:** a worn engine loses power, down to half at full wear.
- **Repairs:** at the boatyard's board in Calder Haven → **Repairs**.
  - Hull: £30 per % of damage, and the yard pumps her out.
  - Engine overhaul: £25 per % of wear, with the engine stopped.
- **Refits in the Shipyard:** the boatyard's board has **Open the Shipyard: refit her** (with her in the yard's port; on your own, or hosting with no crew aboard). You leave VR and the Shipyard opens on your boat. Change her there and go back to the boat: the career pays the difference in price (nothing back for a cheaper boat), and from then on the career starts in her.
  - Repairs can go on credit, so you can always get back out.

  Damage and wear carry over between sessions with the career. The duty board lists both while they're there.
- **Heavy weather:**
  - **No trawling** in a sea over 2.2 m (Hs): the net jumps off the bottom.
  - **Danger money:** rescues, tows and fires in a squall, or in a sea over 1.8 m, pay 50 % more.
- **SOS:** capsized or sunk, send an SOS: **Menu → Boat → SOS → Send SOS**, or press the **red button under the VHF set** (it lights, and the set's screen says CAPSIZED or SUNK, while she's over or under). The salvage tug rights her and brings her into the nearest boatyard's port (Calder Haven or Loch Tarsk), at the cargo berth, engine off and lines off; her damage stays for the yard to mend. On the Voyage maps, which have no boatyard, she's brought into the nearest harbour's cargo berth and made fast there. Anyone in the water comes along. Upright and afloat, the coastguard turns the call down. No charge.
- **Debug:** Debug → Boat → Hull → **Damage** (30 % hull damage and 30 % engine wear).

### Log salvage (side job)

Now and then timber washes up on a beach, and the VHF says where ("timber reported washed up on the north shore of Tarran"). Logs show on the chartplotter as brown **LOG** marks; there are up to three about at once.

1. **Stand off the beach, stern to it.** It's shallow close in, so stay in 2 m or more of water. The line to a log is 30 m, so the boat can lie well off.
2. **Make the line fast:** with the boat hook in hand, click the log (desktop, up to 30 m away: the line is thrown to it). Or use the menu's **Tow → Make fast**, which also works in VR.
3. **Pull it off.** A log on the sand doesn't move until the line pulls harder than its friction (about 8 kN), so ease ahead and then give her more power. It slides down the beach and floats.
4. **Tow it into any harbour** and slow down there for a few seconds. The yard buys it and the radio keeps count.

Logs nobody comes for go again after half an hour. The menu's Debug → Missions section has **Side jobs → Log on beach** to put one on the nearest beach.

### Fishing (side job)

The boat has a trawl: a red A-frame over the transom with a block each side on its crossbeam and a lifting block in the middle, swung by two hydraulic rams, its warps off the tow winch. Its control box stands on a post by the starboard foot: **PAY OUT**, **HAUL** and **RELEASE**.

1. **Find a fishing ground:** the dashed teal rings on the chartplotter (Skerry Ground near the start, Calder Bank east of Calder Holm, The Hollows to the north-west).
2. **Shoot the net:** the **TRAWL** switch on the console, behind the throttle (DECK group), runs it all the way out; or work it by hand with the **PAY OUT** / **HAUL** buttons on the A-frame's control box (hold to run; it stops where you let go, part way out it drags but doesn't fish). The trawl doors go out on the warps astern and the net's orange floats show on the surface. You'll feel the drag: the engine has to work.
3. **Tow at 2–4.5 knots** inside the ground. The net is a real load, so she needs some throttle: idle in gear makes just under 2 knots, and the window runs to about half ahead. Every 30–50 s of good trawling another box's worth of fish goes into the **codend** (the bag at the end of the net), up to 12; the status line counts them, and says why not if you're too slow, too fast or outside a ground. Full, it stops fishing until you haul.
4. **Mind the shallows:** trawling where it's under 7 m deep fouls the net on the bottom. It holds her back hard and catches nothing until you haul it.
5. **Haul the net** (TRAWL switch off, or hold HAUL on the A-frame): the warps wind in and the doors come up to hang on the stern quarters, then the net comes up over the stern, the codend, heavy with fish, rises to hang under the A-frame, and the A-frame swings forward on its rams to bring it in over the deck. You feel its weight on her as it comes out of the water.
6. **RELEASE** on the A-frame's box empties the codend: the fish pour out onto the deck in a heap, and the crew box them, a box every few seconds (into the **fish hold** first, if she has one; else on deck by the heap). Then the A-frame swings back out and the net goes back on its drum. Shoot again with the codend still full and it goes back out with the fish in it.
7. **Carry the boxes ashore** to any port's goods stack to land them. If the deck's full, the heap waits until there's room.

**Trawl deck gear** (a Shipyard boat with the A-frame; Deck gear → Fishing): a **net drum**, a big blue hydraulic drum on the centreline forward of the A-frame, the net wound on it in a green roll; it turns as the net comes off it when you shoot and back on as it comes up the stern. **Trawl winches**: a pair at the deck edges forward of the A-frame, each a drum of warp leading aft up to its block; they turn and the warp runs off and on as you shoot and haul, and with them she needs no tow winch to trawl. Both work on deck hydraulics like the rest.

**Debug → Missions → Side jobs → Fishing ground** takes you to the nearest ground.

### Rod fishing (side job)

A Shipyard fitting (Deck gear → Fishing → **Fishing rods and bucket**, £700): **four rods** standing upright in a rack on a wall of the wheelhouse, their tips above the roof, with a bucket on deck beside them. Place it by pointing near the aft wall (port or starboard of the door) or along a side wall. Every rod is its own, so four of you can fish at once.

1. **Take a rod** from the rack (VR: grip it; desktop: click it). Nothing happens yet: walk to the side, slow the boat right down (under 3 knots) and point the rod over the water.
2. **Cast:** press the trigger (left button). The float flies out about 12 m along the rod and lands on the water.
3. **Wait.** In a fishing ground a bite comes in seconds; in open water, half a minute or so. The float dips and the rod buzzes in your hand.
4. **Strike:** press again within a couple of seconds, or it lets go.
5. **Play it:** hold the trigger to reel. The line's tension rises as the fish pulls (it runs in waves); let go to rest it and the tension falls. Hold on through a hard run and the line parts. Reel it to the rod's tip and it's in the bucket.
6. **Sell:** tie up at any port and the bucket is sold to the fish merchant by weight (£5.50 a kilo, more where a port pays well for fish), with a line in the ledger. The bucket holds 12 fish.

What bites is the ground's own species in a fishing ground (haddock, mackerel, cod...), and mackerel, pollack, wrasse or coalfish along the coast. To put the rod back, click its rack (desktop: or press U) or let go of the grip (VR): the line is wound in, fish or no fish. Crew-mates see the rod in your hand and the fish in the bucket; the float and line are yours alone.

### Lobster and crab potting (new, being built)

A slow-burn fishing job over several voyages. It's being built in stages, so it's **off unless you switch it on: Menu → Settings → Game → Potting → On**. So far (stages 1 to 3 of 5) you can collect the pots, shoot them, mark them on the chart, find them again when they're ready, haul them and sell the catch ashore; keeping your pots between sessions and the propeller rule come next.

1. **Collect the pots:** five lobster pots wait on a pallet on the Calder Haven quay, just aft of where she lies at the cargo berth. Each is a creel: a dark netted frame with its line coiled on top and its orange marker buoy tied on. Carry them aboard one at a time (24 kg) and stow and lash them on the aft deck like any cargo. Five pots is a few trips: a job for two or three.
2. **Steam to a potting ground:** rocky ground round headlands and islands, shown on the chartplotter as **hatched orange rings** ("(pots)"): the south side of Gull Rocks, the east side of the Skerry, round Craig Bheag, and off Tarran's north point. Now and then a local potter on the VHF mentions where the crab or lobster are.
3. **Shoot the pots:** unlash a pot, carry it to the rail and let it go over the side. **VR:** hold it out past the gunwale and let go. **Desktop:** look out over the water from the rail and click, and it's thrown a little way out. It goes in with a splash and a trail of bubbles; a moment later its buoy pops up and stays there, bobbing on the waves. Shot off a ground, it'll catch little; in water too shallow to fish, it's lost.
4. **Mark them on the chart:** the game doesn't track your pots for you: the crew marks them on the paper chart. There's a tray of little red **crab markers** by the pen holder on the chart table. **VR:** grip the tray to take one (it has the next free number), and let it go on the chart where you shot the pot; grip a marker on the chart to move it, or let it go off the chart to take it off. **Desktop:** click the tray, then click on the chart to put it down; click a marker to pick it up, the tray to put it back. Pencil marks work too. Everyone aboard sees the markers, and they're saved with the chart.
5. **Let them soak:** pots need time in the water: about **20 minutes of play** before they're worth hauling, and they keep fishing better up to 40 minutes. (Play time, not the game's clock: the time of day stands still unless you speed it up.) A buoy's **flag is red while it soaks and green when it's ready**, and at night a small light blinks on top of a ready one, but you can only tell from close by (within about 45 m), so you still have to go back to your marks.
6. **Weather:** in a strong blow (over 11 m/s) pots drag along the bottom downwind, buoy and all: a squall moves them a metre or two a minute. Mark carefully and look about when you come back.

7. **Hook the buoy:** take the boat hook from its clips and touch the buoy with its tip; it's on the hook. Draw it in alongside (it can't come through the boat). **Desktop:** with the hook in hand, click the buoy, then look at the water by the side to draw it in.
8. **Bring it aboard:** once it's alongside, **VR:** reach over it with your other hand and grip; **desktop:** click. The buoy comes over the gunwale and the line leads in there.
9. **Haul the line, hand over hand:** **VR:** grip the line where it comes over the side and pull it up and in toward you; let go, take a new hold, pull again (each pull hauls in a bit more than your arm's travel). **Desktop:** look at the line and click, a couple of metres a click. Near the end the pot breaks the surface, swinging and dripping, comes up the side and over onto the deck. **In a swell** (over about 1 m), stop pulling for a moment and the pot's weight drags the line back out: keep at it.
10. **What's in it:** you can see the catch through the netting: brown crabs, blue-black lobsters, maybe a little fish, a starfish or an old boot, or nothing. A good ground, a long soak and calm weather all help. It stays in the pot.
11. **Go again:** every pot is baited, so shoot it again straight away (any catch still in it goes back to the sea), or stack and lash the pots and head home.
12. **Sell the catch:** carry a pot ashore and set it down on a harbour quay, by any port's goods stack or back by the pot pallet at Calder Haven, or, at a harbour, menu → Cargo → **Unload** sells the catch from every pot aboard. The fish buyer takes the crabs and lobsters and pays for each (a lobster about five times a crab; the bycatch goes in the bin), and the pot stays there, empty, to take back aboard.

**All of it in clicks, too:** the menu's Cargo tab has **Load pots**, **Shoot one** and **Haul nearest**, and **Unload** at a harbour sells the catch, for when you'd rather not walk it (or are playing alone).

No timers on screen: the chart marks, the buoy flags and your memory are all you have. Pots lost (overboard loose, or let go in the shallows) are replaced on the pallet: pots are free for now.

**Debug → Missions → Potting:** **Pots aboard** puts the pallet's pots on your aft deck; **To a ground** takes the boat to the nearest potting ground; **Ready** makes every pot in the water ready to haul; **Full** makes them soaked their best (the best catch the ground gives); **On plotter** shows your pots on the chartplotter (the casual-mode view).

### Wildlife

Gulls wheel over the boat by day, gliding and now and then flapping, and calling. Under way in open, deep water, a pod of dolphins sometimes comes up from astern and rides off the bow for a minute or so, each one blowing as it surfaces. They keep up to about 9 knots: go faster and they drop back astern (slow down and they may come up again). They're decoration: worked out from the time and the boat's position, so the whole crew sees the same animals.

## Off the boat, and cargo by hand

- **Walking ashore:** jump (A / Space) from the deck onto a quay or pier when you're alongside, and back aboard the same way. You keep the boat's own speed when you jump, so jumping off a moving boat is a bad idea. Quays you hit just below the top you clamber onto. Beaches you can wade out from.
- **Swimming:** land in the sea and you float with your head just above the water. Swim with grab-the-world strokes or the stick. Climb out by gripping the gunwale or the transom, or press A beside a quay. The workboat has a **swim ladder** over the starboard side of the aft deck: grip any rung from the water (or press A / Space near it) and you're up it. **A crew-mate overboard:** everyone else is told ("Man overboard"). In the water, wave (your hand in VR, hold Y on desktop) so they spot you. They throw you the **life ring**; when it floats within a couple of strokes of you, you take it (you feel a buzz). Then they haul in the line hand over hand (desktop: click the line) and you're towed with the ring to the boat, where you climb out as usual: grip the gunwale, transom or swim ladder, or A / Space by the hull. A / Space away from the hull lets go of the ring. If she's in gear with you by her stern, you shout for neutral. Ignore it and swim into her **turning propeller** (in gear, ahead or astern) and it's messy: a burst of red spray in her wash, a thud, your view goes red and then black, and you come round back aboard. Everyone sees and hears it. Neutral near swimmers!
- **Your health, and berths:** you can get hurt. The **cold** in the water wears you down (from full health to blacking out in about 8 minutes of swimming); a turning **propeller** takes a big bite; a **fall** from higher than about 2.5 m hurts, more the higher; and a fire's **flames**, or its **smoke** downwind, hurt while you're in them. The view flashes red when you're hurt, and a message warns you when your health gets low; on the desktop your health shows at the bottom right while you're below full. Run out and you black out: you come round aboard, at half health. **A berth heals you:** press its mattress (trigger or click) to lie down, the view dims, and you mend (from nothing to full in about a minute and a half), as long as nothing's hurting you. The berths in a Shipyard boat count, and so does the V-berth in a cabin below. **Sleep:** with everyone in the game lying in a berth, you sleep and the hours pass quickly (about 15 game minutes a second). Lie down hurt and you get up by yourself once you're well, by day; otherwise you sleep until 07:00. A step (stick or WASD) or a jump gets you up at any time.
- **Cargo:** each port has a dozen goods waiting in rows on its quay or beach, coloured by destination. They're man-portable (30–110 kg). Carry one to the boat, set it on the deck, and at its destination set it down ashore near that port's goods stack to deliver it. Dropped in the sea, it's lost.
- **Crane cargo:** at every port with a cargo quay, three heavy loads (a pallet of blocks, an engine block, a chain basket, 380–450 kg) wait along the quay edge by the cargo berth. They're too heavy to carry: lie alongside, and lift them aboard with the deck crane (move along the quay to come under the next one). At the destination, set them down on its cargo quay with the crane. They pay three times a hand load.
- **Lashing:** loose cargo slides when the deck heels or accelerates past friction (μ ≈ 0.35, so from about 19° of heel, sooner in a seaway) and goes over the rail if pressed against it hard enough (about 33°). Strap it to a D-ring (the rings along the bulwarks and centreline) and it stays put. Cargo is real weight in her stability: stow it all to one side and she lists.
- **Selkie Bay** has no quay: anchor in the bay, launch the skiff, load her (up to three crates or two drums), run her up the beach and carry the goods up to the stack. Or, in a boat with a bow ramp, land on its slipway (below). Survivors can only be landed at a quay.

### Landing slipways (bow-ramp boats)

**Calder Haven** (just south of the quay) and **Selkie Bay** (up the beach by the goods stack) have a concrete **slipway** running down into the water, kerbed each side.

1. **Lower the bow ramp** (the green button by the bow or on the cabin wall). Its **toe flaps**, folded on the ramp, flop over as it comes down.
2. **Come in slowly, bow first**, lined up with the slip (under 2 knots, within about 20°).
3. Near the slip she's **drawn up onto it** at a walking pace and **landed**: she lies level, her bottom on the concrete, the ramp down and its flaps resting on the slip. The waves no longer move her. Her engine and electrics run on as usual.
4. **Walk off** down the ramp and its flaps onto the slip, and back up the same way, carrying cargo if you like. Landed on a port's slip, she's **in that port** for cargo, the harbour office and the menu's quick jobs.
5. **Go astern** to come off (or Menu → Boat → **Cast off**).

The landing craft and the Shipyard's landing craft land; the workboat (no ramp) doesn't. **Debug → Boat → Hull → On a slip** lands a ramp boat on the nearest slipway at once.

## The archipelago

A new game starts in **Calder Haven**: your boat lies moored alongside the quay in the sheltered harbour, and you stand on the quay beside her. Walk aboard, power her up and start her; the harbour master talks you through your first voyage. The other ports are a few minutes away. Bearings and ranges are on the menu's Voyage tab.

| Port | Type | What's there |
|---|---|---|
| **Calder Haven**, Calder Holm (SE, ~0.5 nm) | Sheltered harbour | A narrow entrance between breakwaters (Fl R 4 s to port, Fl G 4 s to starboard, entering), a calm dredged basin (4.5 m), a fendered quay with a **fuel berth** at its north end |
| **Brannock Pier** (WSW, ~0.4 nm) | Big pier | A 130 m pier into deep water with a T-head berth, **fuel** on the T-head, and a red pier-head light |
| **Selkie Bay**, Rona (S, ~0.6 nm) | Anchorage only | A horseshoe bay about 9 m deep with a beach at its head, sheltered from most of the swell |

Also look out for **Gull Rocks** (on the direct line to Calder Haven), **Tarran** with its lighthouse (Fl W 10 s), Skerry and Eilean Dubh.

### Beyond home: the regions (being built)

The world is growing: new map areas round home, each with its own harbours, weather, fish, goods and jobs, reached by a short passage across open water. For now (on /next/):

- **You can see far.** On a clear day the land shows out to the horizon, hazing with distance, instead of dissolving at 2.5 km. In fog or rain it closes in as before, and lights fade out at the range the weather allows.
- **A hill to the north.** From Calder Haven look north on a clear day: a cairn hill about 4.6 km off across the sound, the landmark of the first new region, the Sounds. Steer for it and its island fills in as you near it (built while you sail; nothing to wait for). There is nothing else there yet: its harbours, tidal races and grounds are next.
- **Home has a landmark too:** a cairn and a trig pillar on top of Calder Holm.
- **A tidal race in the sound.** On the direct line to the hill lies **Sruth Tarsk**: 500 m of water running north on the flood and south on the ebb at up to 9 kn, six hours a full cycle, slack at 00:00, 03:00, 06:00 and so on. You hear its roar and see the standing waves and whirls from outside. Go in against it and your log still reads your full speed while the land shows you crawling; a boat slower than the water goes backwards. Whirls knock the helm about. **Wind against tide:** when the sea is running against the race (the wind waves meeting the flow head on), the waves in it stand up higher and sharper with a short chop on top: overfalls, steep and hard to drive through, and a sea puts real drag on a hull (added resistance in waves, more the bigger the waves and worse head on), so she slows well below her calm-water speed. With the tide the sea eases a little. The forecast says "wind against tide: overfalls" for a race where it's so. Go round it, wait for slack (the VHF forecast says when; the plotter shows the race and its speed now), or punch through in a fast boat. **Short seas everywhere enclosed water makes them:** the sea at any spot grows with the wind and its fetch, the open water upwind. So in a sound, a loch or a bay you get a short, steep chop, and in open water a long, heavier sea, with swell only where the water's open to it. The forecast says when to expect a short steep sea in the sounds. (Debug → World → Sea: Short seas Off, to compare with the sea as it was, and the sea where you are.) (To see the overfalls without waiting for the tide: Debug → World → Tidal races → **Ebb**, with a Rough sea. **Flood** pins the race the other way, with the waves, and eases the sea.)
- **The clock runs now:** a game hour every five real minutes (Voyage → Time flow), so the races turn and night comes in a session.
- **The Sounds.** Across the sound to the north: **Loch Tarsk**, a sea loch harbour with fuel and a repair yard that mends her cheaper than home and is the only place to fit the radar and the heavy towing post; **Garbh Pier**, an exposed T-head on Eilean Garbh's south-west point, only workable when the sea allows; **Camas Tarsk**, a cliff inlet entered on a leading line of two white lights between the rocks, sheltered from all but the south. Two races (Sruth Tarsk, 9 kn; Sruth nan Con, 6 kn, in the narrow channel inside the grey dogs), a lighthouse on Sgeir Mhor, skerries with lobster, haddock on Tarsk Bank and mackerel in the sound. Whisky goes out, feed and building materials come in. Its own calls: a creel boat drifting toward the race, a fish-farm cage section adrift, a kayaker off the skerries. The weather there is rougher, with fog and drizzle.
- **The Fjord.** One more crossing out, north-east of the Sounds: a long fjord cut into a mountain mass whose walls rise straight out of the water to 300-500 m, with Kvasstind (about 760 m) the landmark you see from the Sounds and from home. **Kvasstraumen**, an 8 kn race, runs in the narrows at its mouth under the Kvassnes lighthouse (Fl W 6 s). Inside: **Kvassvik**, the village at the fjord's head on the floor of its valley, with the cheapest fuel in the islands; **the Kvass fish farm**, six cage rings and a feed barge off the village (the barge takes feed pellets and ships salmon); **Ytterbrygga**, an exposed pier on the open coast just south of the mouth, where the feed pellets land; and **Trangvika**, an anchorage in a basin (mud bottom) at the end of **Trangfjorden**, a side fjord whose entrance is a 100 m gut between sheer walls, marked by a red and a green light: no room to turn, so you commit. Waterfalls come down the walls. Cod outside the mouth, halibut in the deep inside. Its calls: a cage ring torn off the farm, a fishing boat with a fouled propeller off the mouth, a kayaker in Trangfjorden. Its weather is calmer, and inside the fjord the sea is broken by the narrows. Cargo box colours there: red Kvassvik, pink the farm, cyan Ytterbrygga, brown Trangvika.
- **Rocks on the passages:** on the straight lines between the regions' harbours there are rocks, charted but unlit: one at the edge of the race on the way from Calder Haven to Loch Tarsk, two groups on the way to the Fjord, two on the way to the Narrows. On a clear day you see them; in fog, plot your course on the chart and keep a compass course round them.
- **Katabatic gusts (the Fjord):** in light weather, cold air falls off the mountains without warning: a squall of up to force 8 or so on part of the fjord for half a minute or a minute, coming up in a few seconds. The only warning is the water: a dark, ruffled patch streaked with spray racing toward you a few seconds ahead, and then you hear it. It heels her and shoves her bodily downwind; in Trangfjorden's gut that means toward a wall. The VHF forecast warns of them while the weather is light.
- **The Narrows.** North-west of the Sounds, one more crossing out: two steep forested islands, Hemlock and Kestrel, with **Cutter Narrows** between them, about 300 m wide, the strongest race in the game (12 kn at peak, slack at 00:45, 03:45 and so on). In mid-channel lies **Twin Fang Rock**, two pinnacles 0.6 m under the surface with an isolated danger mark: let the race sweep you onto it and she grounds. The long way round is **Spruce Channel**, a dog-leg through flats a metre deep west of Hemlock, buoyed red to port and green to starboard going in from the sea, with two wrecks on the flats beside it (cardinal marks): leave the buoys and you're aground. At night it's a line of flashing red and green lights. Both ways lead to **Ashby Cannery** on Hemlock's north shore, behind a breakwater: fuel, and a buyer who pays the best price in the islands for fish (and well for crab). **Kestrel Wharf**, an exposed pier on the outside shore facing the Sounds, takes the groceries and fuel drums; **Otter Cove** is the anchorage: a narrow mouth with Otter Islet across it, passages either side, and a snug basin behind (weed bottom: let out plenty). **Signal Peak**, Hemlock's summit, carries a radio mast with a red light, seen from the Sounds. Salmon on Cutter Bank, halibut in Halibut Hole north of the narrows, crab round Kestrel. Canned fish out. Its calls: a log boom section adrift toward the narrows, a gillnetter with a dead engine, a yacht lost in the fog. Its weather: cloud and rain, and fog most mornings. Cargo box colours there: silver Ashby, black Kestrel Wharf, olive Otter Cove.
- **The chart has sheets:** press the chart rack on the wall above the chart table (the pigeonhole with the folded charts, at the table's forward end) to turn the sheet: home, then the Sounds, then the Fjord, then the Narrows, then the archipelago sheet (every region), then home again. Lighthouses are charted with their light (Fl W 10s is a white flash every 10 seconds), and on the detail sheets the smaller pier and channel lights too. Your pencil marks are places on the sea, not on the paper: a plot drawn on one sheet shows on any sheet that covers that water, in its place, and not on the others. The plotter follows you anywhere.
- Debug (Settings → Game → Debug tab → Shown): **World → To region** moves the boat between regions; **World → Katabatic gusts → Gust now** drops a gust on the gust zone nearest the boat (beside it: what the gusts are doing); **Views → Region map** shows the regions, what's loaded, the races and the gust zones (filled while a gust is blowing) on the perf panel.

### The coast viewer (work in progress)

https://tartanski-cpu.github.io/SWVR/next/coast.html shows the first real-coastline region made from open map data: Oban and its approaches, from Kerrera to Connel, at full scale. Fly round it (drag, wheel, W A S D) and switch on the overlays. Its real buoys and lights are there (the lights flash their charted characters; try **Night**), with the skerries and the Falls of Lora race. Press **Drop test boat** to drive a simple boat by the marks: W and S for the throttle, A and D for the rudder, space to stop; she runs aground where the water is too shallow, and **Race** switches the Falls between slack, flood and ebb. The harbours are there too, built from the map: Oban's piers, quays and pontoons, Kerrera and Dunstaffnage marinas, the Kerrera ferry, with the town buildings round them. Pick one from **Go to harbour**, drop the boat, come alongside slowly and press **T** to make fast (W or S casts off). **In the game (a test):** with the Debug tab shown (Menu → Settings → Game → Debug tab), Menu → Debug → World → **Coast region test → Oban (from the map)** reloads the game with Oban north of home in place of the Sounds and the Fjord (or add `?coast=oban` to the address; `?coast=off` or **The Sounds (as built)** to go back). Sail north from Calder Haven: the south entrance of Kerrera Sound is dead ahead about 2.5 km off, and Oban is up the sound. **Tayvallich and Loch Sween** is the second (`?coast=tayvallich`, or its button there): steer north from Calder Haven into the mouth of Loch Sween, up the loch past the Taynish peninsula to Tayvallich, the harbour, and on into Caol Scotnish, the narrow arm with the Fairy Isles anchorage at its head. No buoys or lights there yet (none are mapped). Careers played there are kept apart from your own. The map data's credits are under Menu → Settings → Game.

### Cargo

Each port has three items waiting ashore, each bound for another port. The box colour shows the destination: **blue** Calder Haven, **orange** Brannock Pier, **green** Selkie Bay.

1. **Go to a port's cargo berth:**
   - **Calder Haven:** the middle/south of the quay, where she starts: the goods wait on the quay alongside her aft deck. Fuel is at its north end.
   - **Brannock Pier:** the south-east end of the T-head. Fuel is at the north-west end.
   - **Selkie Bay:** anchor in the bay, since there's no quay; the goods come off the beach.
2. **Stop and load it.** Either by hand: carry each item aboard (grip in VR, click on desktop; a job for the whole crew), set it on deck and lash it to a D-ring (trigger / Q). Or in one click: menu → **Cargo** → **Load**, which puts aboard everything waiting there for another port that she has room for, lashed down. There are four deck slots and a 5 t payload limit either way.
3. **Take it to its destination and land it:** carry it ashore to the goods stack, or menu → Cargo → **Unload**. That's a delivery. A replacement cargo then appears at one of the ports.

**Every crate and pot job works both ways** (by hand, or by a button in the menu's Cargo tab, with the same rules): **Load**, **Unload** (cargo for this port, fish boxes, crates fished out of the sea, and the catch in your pots), **Lash all** / **Release all**, **Lift crates** (floating crates within 15 m of her side come aboard, no boat hook needed), and for pots **Load pots** (from the pallet at Calder Haven), **Shoot one** (a pot over the starboard side) and **Haul nearest** (the nearest buoy within 25 m). The buttons say why not when they can't: not at a port, not stopped, no room, nothing in reach.

Cargo looks the part: crates are boarded and braced, sacks woven, drums scuffed, all in the colour of the port they're bound for.

Cargo is real weight. A full load sits her about 10–15 cm deeper and down by the stern, and she'll feel heavier.

### Docking

You can dock along any quay or pier face with deep water alongside. The named berths are marked with a **yellow strip** on the edge:

- **Calder Haven quay:** a fuel berth and a cargo berth.
- **Brannock T-head:** a fuel berth and a cargo berth.

To dock:

1. Come slowly alongside: within about 18 m, under 3 kn, roughly parallel to the quay (bow either way).
2. Go out on deck. There's a **mooring cleat** on the bulwark top forward and aft on each side. Click the forward cleat on the quay side: the bow line goes to the forward bollard. Click the aft one: the stern line goes to the aft bollard. (Each line goes to the bollard just beyond that end of her, so a long trawler's lines lead out from her bow and stern; the quays have bollards along their whole length.) (The menu's Boat tab, **Dock**, does both at once.)
3. The lines come taut and warp her in over a few seconds. With both fast she's moored: held alongside, but still moving with the swell. With one line only, she hangs off it.
4. **Cast off:** click each cleat again to let its line go (or **Cast off** on the menu). A hard pull with the engine parts the lines.

**Night:** the ports have lamp posts. Near a port, its floodlight lights the quay, your boat and the water around you.

- **Collisions:** you can run aground and hit quays. Fenders are soft; rock isn't.
- **Refuelling by hand:** come alongside a fuel berth (Calder Haven quay, north end; Brannock T-head) and stop. On the quay, the red pump has a hose and nozzle:
  1. **Take the nozzle** from its holster on the pump's face: grip it (desktop: click it). The hose follows; it reaches about 10 m.
  2. **Walk it to her filler:** a round chrome cap on her side deck, each side, just aft of the wheelhouse. When the nozzle is close enough, a **green ring** lights on the cap: let go of the nozzle there, or pull the trigger (desktop: click the filler).
  3. **Back to the pump: press START** (the green button; touch it and grip or pull the trigger, desktop: click). The gauge shows the litres and the price since you pressed START, and her tank. **STOP** (red) when you have what you want; it stops by itself when she's full. You pay when the fuel stops.
  4. **Take the nozzle out** of her filler (grip it again) and **hang it back** in the pump's holster (let go of it there; desktop: click the pump).

  Put it down anywhere else and it lies on the quay; over the water it swings back to the pump. If she drifts off with it in, it's pulled out and the fuel stops. Or, in one click: **Refuel** on the menu's Boat tab, as before.

On desktop, aim the **+** reticle at a control. Click buttons and switches. Click and drag the lever (mouse up/down) and the wheel (mouse left/right).

## Shipyard (being built)

Design your own boat at https://tartanski-cpu.github.io/SWVR/next/shipyard.html (work in progress). The page is dark, easy on the eyes next to the game. It works like a designer's tool, in steps along the bar under the title: **Brief → Hull → Wheelhouse → Deck gear → Furniture → Engine → Controls → Paint → Trials & handover**. **← Back** and **Next** sit at either end of the bar, or click a step. In a session everyone moves together: when anyone changes step, everyone goes there, and the bar says who moved you.

**Her key figures** run across the page under the steps, big: **price, top speed, range flat out, stability (GM)** and **deck cargo** (pots instead when the brief is for potting; **bollard pull** too when she's to tow), each with the brief's target under it, a tick and a green edge when she meets it, a cross and a red edge when she doesn't. The last box says how much of the brief she meets; click it to see the brief's lines. Speed, range and bollard pull come from her sea trial and go grey while a new trial runs. **The view's size:** the switch at the top right of the 3D view. **Design** (the usual) gives the panels room and the view what's left; **Balanced** gives the view more; **Big view** gives the view the whole width, and the step and the figures slide in over it from the edges: click **Step** (left edge) or **Brief & figures** (right edge) to show or hide them. Your choice is remembered in this browser. **The right-hand column:** the brief line by line, then **Needs attention** (her warnings, with a count; gone when there are none), the to-do, then her figures in groups that fold: **Size & form**, **Stability & balance**, **Deck**, **Machinery**, **Price & weight** (her weights part by part), and **Sea trial** (its charts folded inside it). Each group's title shows its main figure even when it's folded; click a title to open or fold it, and the page remembers.

Each step shows what you're working on. The **first step, Type**, shows the hull types as cards: each with a picture of her from the side, what she is, what she's **made for** (the landing craft cargo; the gillnetter fishing and pots; the pilot boat search & rescue and fire; the small tug heavy towing; the stern trawler trawling) and what she can **also** take on lightly, and her best speed, deck room and pull. Click a card to start from that hull, with her usual engine, and go on to shape her. **Her jobs and targets** (optional, folded away on the left) still work as before: tick her jobs and set targets, and the cards say which types can meet them (and starting from one then finds her the engine that does it, by trial). "Exploring" is a tag only for now: there's no exploring job in the game yet. At **Hull** you see the hull and its protection (fenders, strake or tyres), without the wheelhouse or the gear. At **Wheelhouse**, the house and what's inside it stand over a see-through ghost of the hull, so you can still see where her sides are. At **Engine**, hull and house both go see-through and you see her machinery: the engine (or two, side by side, for a twin installation), its gearbox, the shaft down to the propeller, the propeller at the size her design gives it, and the rudder. Each engine type has its own look: the straight six long and narrow, the V8s short and wide, the tug diesel big and tall. Labels give the engine and the propeller's diameter. The propeller hangs under her bottom with its tip clear of the plating, and the shaft rises forward from it at a shallow 10° (small craft run about 8-12°). The engine sits on the end of the shaft, tilted to the same angle, wherever it first clears her bottom on its bearers, so the shaft angle decides where the engine goes. The rudder runs from her bottom down behind the propeller. **The engine has to fit under the cabin floor (or the deck, if it ends up outside the house):** if it doesn't, it shows red with "Too tall by … cm", her warnings say so, and the brief gets a line it fails until you give her more depth (Hull), raise the floor (Wheelhouse) or pick a smaller engine. The tall tug diesel needs a deep hull: it won't go in the landing craft or the gillnetter as they come. The view turns to the machinery when you arrive, and again when you change engine. **In the game the same engine is there, where her shaft line put it,** under an engine hatch cut over it: in the deck if the engine is forward or aft of the house, in the cabin floor if it's under the house (aft of the helm), whichever holds most of it, and clear of her deck gear. Open the hatch to see it and check the oil. Her weight is carried there too, so where the engine goes changes her trim a little. **Where the engine goes:** on a shaft, the engine sits where it best balances her (her centre of gravity over her centre of buoyancy), the shaft as steep as 15° if that lets it sit further aft. Or tick **Stern drive** (Engine step): the engine goes right at the back against the transom, driving a leg through it that swings to steer, like an outboard's (no shaft or rudder; a leg each for twin engines). It balances her and frees her deck; its propeller is smaller, so she's a little slower for her power. Not for the slow tug diesel. Or tick **Kort nozzle** (Engine step; a shaft-driven propeller only): a duct round the propeller, as a tug has. She pulls about 30 % harder at a standstill for the same power, and her rudder answers at low speed and astern (it sits in the nozzle's jet); she's slower free-running, and poorer going astern. It costs £12,000 and shows in her figures ("in a Kort nozzle"); the gearbox is re-matched to it. The Engine step's view draws it round each propeller (a duct with a flared mouth, hung from her bottom, the rudder just aft of it); the game itself doesn't draw it. Or tick **Pod drives** (Engine step; a planing hull: the landing craft, the gillnetter or the pilot boat): two pods hang under her bottom, forward of the transom, each driven by its own engine just forward of it (always twin). Each pod's propellers are at its front and pull; the pods swing together to steer with the wheel (no rudder). She gets a black throttle and a **helm joystick** for berthing (see Bridge). They cost £24,000 each and show in her figures ("on pod drives"). Not for the slow tug diesel, or with outboards. The figures show her **Balance**: where her weights put her centre of gravity against her centre of buoyancy. **What she's built of:** the gillnetter and the tug are steel, the landing craft and pilot boat aluminium (a design on the retired workboat type can be either: Hull step, "Built of"). She floats at what she weighs: her hull plating, houses, engine, gear, fuel and crew are added up (the figures list them), and her lines sit as deep as that weight needs. Steel is cheaper to build but heavy, so she sits deeper and is slower for her power; aluminium costs more and goes faster. **Or outboards:** pick two, three or four 400 hp petrol V8 outboards instead of the engine. They hang on a bracket off her transom, swing left and right as you turn the wheel (they steer her: there's no rudder), and sound like it. Their lower units are geared to her by trial, like a gearbox, so she reaches her rated revs flat out.

**Sharing a design:** at Trials & handover, **Copy link** puts a link to the Shipyard with her (and her name) on your clipboard to paste in a message; **Save file** downloads her as a small design file, and **Open file** opens one. Her code is still there to type in VR, while her wheelhouse sits on the code's old steps; set its measurements finer (the Wheelhouse step's sliders move in centimetres and degrees) and she has no short code: share her by link or file, or save her to favourites. Codes from the earliest Shipyards (shorter than 17 characters) no longer open.

**Live trials** (the Trials & handover step): three tests run in front of you on her as designed, with the game's own physics in calm water. A chart and readings follow each one, and her model shows the game's physics debug: the slices of her hull the physics floats (blue), the buoyancy on each (yellow arrows) and her centre of gravity (red).
- **Drop her from 4 m:** lifted, a little heeled and trimmed, and let go, as the game's Drop test. She falls in, plunges and settles. It reports her heave period, how deep she plunged and whether she came back to rest.
- **Roll from 45°:** heeled hard and let go. It reports her roll period and how fast the roll dies away (damping), or that she didn't come back.
- **Inclining experiment:** a test weight (6 % of her displacement, bigger than a real test's so the heel shows; the yellow block on her aft deck) is moved across her. She heels to a steady angle, and it works out her GM from it, as a real inclining experiment does.

**Sketching:** press **✏ Sketch** and draw with the mouse (or a finger) on her **Port**, **Starboard**, **Plan**, **Bow** or **Stern** view (the view buttons; Port and Starboard look straight side on, and the Plan has her bow to the right). The view goes flat and square on, and a faint squared sheet of glass stands just clear of her on that side. It's the same sheet for everyone in the session, and anyone with that sketch open sees your pen moving as you draw. Each view keeps its own sketch, listed under **Sketches** on the right. A sketch shows only while it's open: click it in the list to open it (the view goes to it), and press **✏ Sketch** again to close it and go back to the view you had. **↶ Stroke** takes back your last stroke on the view; **✕ Clear view** rubs out everything on it. Sketches made on snapshots before this are still in the list.

- **Brief (step 1): start from her jobs.** Tick **her jobs** in the game (cargo runs, lobster & crab pots, towing, fire fighting, search & rescue, trawling) and set her targets: top speed, range, price, stability (GM), a crane, and for cargo or pots how many she must carry on deck. Name her at the top.
- **Hull types for this brief:** the hull types, best first, each with what it can manage against your targets (✓ / ✗: speed, range, price, pull, deck room), from its measured sea trials. **Start from this hull** gives you that type as a **bare hull** (no deck gear), **sized for the deck cargo you asked for** (longer and beamier together until the crates or pots fit; a type that can only manage it stretched says so on its card), and every engine fit (three engines, single or twin) is tried on her by sea trial and the cheapest that does the job fitted.
- **The brief is checked all the way** (top of the right-hand column): each target ✓ or ✗ with her figure, and when one isn't met, what to change and a button to that step. Each job adds its own lines: crates or pots on deck, bollard pull for towing (3 t), the gear the game's job needs. The last step says whether she meets the brief.
- **Deck cargo:** her figures (and the strip under the 3D view) say how many of the game's crates stand on her open deck at once, by the game's own rule for where cargo can go, and within what she can carry; and how many pots.
- **Sea-trial charts** (right-hand column, above the numbers): speed and range at each lever position (with the brief's targets dashed), her turning circle (advance, transfer, tactical diameter, her length to scale), the roll dying away after a 10° heel, and her stopping distances in metres and boat lengths. Hover a dot or bar for its figures.

Then the choices, a step at a time:

1. Pick a hull type (landing craft, gillnetter, pilot boat, small tug or stern trawler; the workboat type is retired: a workboat is a role, not a hull type, and a design already on her still opens), size her with the sliders (the landing craft goes from 7 m right up to 22.5 m, her beam growing with her; her depth and ramp grow more gently, so the big one isn't a wall out of the water), and rake her stem from plumb to 50° (plumb, or the first step, is a straight stem with a rounded forefoot where it meets the keel; more rake curves it all the way down; not the landing craft, whose landing bow is her own: her V bottom sweeps up in a steep rake, the beach plate, to a square box section under the ramp, so she rides up a beach or a slipway; nor the tug's push bow). **Size her for the brief's deck cargo** does the sizing again (say after changing the brief). **How each type rides:** the pilot boat is a deep-V planing hull, built to go fast in waves: she leans into her turns and rides softest in a sea. The landing craft is flatter: fast, and she leans into her turns (the smaller she is, the more), but she slams in waves. The gillnetter planes gently; the tug is a displacement hull. No type capsizes in a hard turn, even with four outboards. **Or shape her on the view:** at the Hull step, round coloured **handles** sit on her where each slider acts, each its own colour, with a dot of that colour beside its slider so you can see which is which. Point at one and it grows and lightens (its slider lights up in its colour too) and says its value; drag it along its line and she reshapes as you go, snapping to the slider's steps, with a line showing the dimension ("as far as it goes" at the end). **Length** at her stem head (forward); **Bow rake** where her stem meets the water (aft, as the rake cuts her forefoot back; not on a landing bow or a push bow; on the catamaran, at her starboard hull's stem); **Beam** at her starboard deck edge amidships (out); **Depth** on her deck amidships (up); **Bulwarks** on top of them on her port quarter (up); **Sheer** at her starboard deck edge forward (up); and, on a type with one, the **Raised foredeck**'s break (drag aft from her bow to make one) and **Its height** on top of it (up). A handle hides when you'd be dragging it straight towards you (turn the view). One undo takes back a whole drag.
   - **The small tug** is short, deep and beamy (13 × 5.4 m, 1.65 m draught), with a strong sheer up to a high square **push bow**. On the bow plate stand two rubber **push knees**, either side of the centreline, from the bulwark top down nearly to the waterline. She starts with one slow-revving tug diesel, a rubbing strake, and the house forward with its floor raised to see over the bow. Her bow is her own: the bow-rake slider reads "push bow". Nose her into a quay or push another boat and the knees take it, not her plating. She's slow (about 8.5 knots flat out on the tug diesel, 9.5 on twin 400 kW V8s or twin tug diesels: a displacement hull, so more power barely moves her past her hull speed) but pulls hard for her size.
   - **The stern trawler** is a 20 m hard-chine steel hull (16 to 23.5 m on the Length slider), 7 m in the beam, about 130 t and 2.2 m draught: a high **whaleback** forward (a raised foredeck), the wheelhouse forward on it, and a long low working deck aft to the transom. Her sheer is a little gentler than at first (her deck about 1.15 m higher at the bow than aft, was 1.5 m; **Sheer** on the Hull step adds more). She comes with the whole trawl outfit: the A-frame over her stern, the **net drum** and the pair of **trawl winches** forward of it, a **fish hold** under the working deck (about 90 boxes), the 750 kW diesel in a **Kort nozzle**. She's slow (about 10 knots) but carries far more than any other type. Her deck is the biggest in the yard (about 160 crates). Her exhaust is the tug's: a stack up through the wheelhouse's aft corner (raked or straight, Engine step), smoke from its top, and her cooling water spitting from her side. She's beyond the short code's hull types, so she travels as a **link or file**, not a code.
   - **The fast catamaran** is a 12.5 m aluminium work cat (10 to 14.7 m on the Length slider): two slim hard-chine hulls under a wide, flat bridge deck, so a wide working deck for cranes and cargo, and very stiff in roll (she rolls quickly and the roll dies away fast). Always **twin engines, one in each hull**, each with its own propeller and rudder; the wheelhouse forward over a wide deck aft (or aft: Position). She comes with **twin 400 kW** for about 30 knots at her standard size (twin 280s make about 24). She's about 13.5 t light as she comes. Her bows take the Bow rake slider like the others: plumb as she comes, as most work cats (no ramp). She travels as a **link or file**, not a code.
   Choose her **hull protection**, what keeps her sides off a quay:
   - **Fenders**, the cheapest, and what a new design starts with. A basket on deck: press it to put the fenders over the side coming alongside, and again to take them in. They only help while they're out.
   - A **rubber rubbing strake**, fixed, right round her sheer and the transom (across a square bow too, if she has no ramp). Firm: it takes a rub or a moderate knock.
   - **Tyres**, fixed, in a close row along her sides and one on her stem, as on a tug. Soft and grippy, the best at a hard knock and for pushing, but a little extra weight and drag.
   - **Strake and fenders**, or **none**.

   Hit a quay too hard and her hull is damaged and leaks. Each of these takes up part of the knock first.
2. Optionally give her a **deckhouse**, as on pilot and rescue boats: a lower block on the main deck from the wheelhouse's aft wall forward, that the wheelhouse stands on. Choose how far it reaches forward of the house, how far it runs on **aft** of the house (up to 6 m: a deck behind the wheelhouse that its aft door opens onto, railed, with a steep stair across its aft face down to the working deck (walk up and down it, from a landing near the middle down to starboard), as on a stern trawler; gear on the aft deck keeps clear of it), its height (up to 2.5 m, high enough to see over a trawler's gear), its width (out to her sides, or set in leaving side decks) and its front (upright, or raked 30° or 50°). The helm is then raised onto it, with steps up to the aft door. For now it's solid: no way in, and its top isn't walked; its weight is high up, so her GM drops a little.
   Place and size the wheelhouse (and fit a **chart table** along its port wall if it's wide enough), and shape it: its floor height (sunk below the deck or raised to see over the bow, with steps at the door), the front windows (raked aft for a fast patrol look, upright, or reverse-raked like a pilot house), and the roof: one flat slab overhanging the windows by a set 30 cm, its thickness (10, 20 or 30 cm) and its front edge, raked back as it rises at 30, 45 or 60°. Designed houses have no roof ladder or rail.
3. Add deck gear (pin it, above, or by hand): a **deck crane** on the foredeck (at the starboard edge) or the aft deck (at the port edge), leaving the middle of the deck clear (see below), and a **searchlight** and a **fire monitor**, each on the wheelhouse roof or on a pole on the foredeck or the aft deck. On a pole, each has its own controls in a box on the pole at hand height (a joystick, its switch, and the monitor's FIRE gauge); stand aft of it facing forward and work it like the helm's. One on the roof is worked from the helm; one on a pole also from the helm if you pick the advanced controls. And the working deck gear: a **tow winch** (aft deck), a **stern roller** in the transom (her tow point), a **trawl A-frame** over the transom with its net (it brings the winch, whose drum hauls the warps), a **life ring and boat hook** (on the wheelhouse's aft wall, port or starboard, the ring's line on that quarter's cleat: with them she gets the **rescue calls** in the game, survivors climbing aboard over her transom and sitting on her open deck), and a **side door** in the wheelhouse's port wall (it needs a side deck outside to step onto: a narrower house leaves one).
4. Choose her instruments, in three tiers: **Old school (analogue)**: round gauges set into the dash on backing plates (a compass, the log, depth, the anchor chain counter, revs, temperature and fuel, and a brass ship's clock), the cheapest; **Basic electronic**: speed and depth, the anchor, rpm and the time on small screens; or **Advanced**. Every tier has **navigation lights** (their switch on the LIGHTS plate) and the engine's warning lamps (OIL, CHARGE, GLOW, NEUTRAL, **TEMP** when she's overheating, **FUEL** when low, BILGE, HULL, ENGINE). With Advanced, **Screens** chooses separate screens or **one or two touchscreens**: one screen with tabs along its top (speed, heading, engine, systems, anchor, tow line, wind) that you press to flip pages, the time beside them; the whole crew sees the page you pick. One touchscreen makes room for a short console in a narrow wheelhouse. Every boat has the **VHF** (calls, forecasts, the harbours). Advanced adds the cabin light, wipers, horn, FM radio, the chartplotter, the NAV / WIND screen, the task board, an **overhead switch panel** over the helm for her **foredeck and aft deck floodlights** (on the DECK LTS breaker) (hung on the roof's front and aft edges and aimed out over the decks, so they don't light the wheelhouse inside), and a **pull-down whiteboard**: pull its handle and it unrolls from its box under the roof by the aft wall; pull again and it rolls up.
5. Choose an engine, single or twin (its propeller is matched by trial). Every step shows its choices as pictures (the hull types, her protection, rails and material; the wheelhouse's windows, console, chart table, lining and floor as samples; the instrument tiers and screens; the engines and drives), each step's longer notes and each piece of deck gear's or furniture's description behind a small **i**. On the Engine step: each engine, drive (**Twin**, **Stern drive**, **Pod drives**, **Kort nozzle**), exhaust stack and outboard set as a small drawing with its name and one line; press its **i** for the full description (or hover over it). A drive that can't go on her is greyed out. The **slow-revving tug diesel** (450 kW, 1000 rpm, on a shaft; single or **twin**, two screws, for a faster tug) turns a bigger propeller for a harder pull, and sounds like the straight six, slow and deep. The **750 kW diesel** (a big medium-speed straight six, 1000 rpm, 4.8 t, on a shaft; single or twin) is the biggest: the stern trawler's as she comes, turning a 1.9 m propeller for about 10 knots and an 11 t pull (the tug diesel gives her about 9 knots and 6.6 t). It's tall and heavy: it wants a long, deep hull, and makes a small one tender. A slow displacement hull (the tug, the trawler) takes only so much power for her weight: the small tug as she comes takes one 750, or twin tug diesels, but not two 750s (she's built with one, and told why). A boat with it travels as a link or file, not a code. **Twin engines** each have their own sound, slightly out of step, so they drone in and out of phase as on a real twin-screw boat. Then choose basic or advanced controls, a paint, and the roof's colour (the hull's, or orange, white, grey or black).

**The deck crane** is worked from the post beside it, once the engine is running and the DECK HYD breaker is on. Its desk is laid out like a crane's radio remote, two joysticks, one for each hand:
- **Left stick (yellow):** sideways slews the crane; push to raise the boom, pull to lower it.
- **Right stick (green):** sideways runs the telescopic boom out (right) and in (left); pull back to hoist the hook, push to lower it.
- **HOOK** (red, between them): takes the load under the hook, or sets down the one on it.
- Each works at a rate, as far as you push it, and springs back to centre when you let go: the crane stays where it got to. In VR, take one stick in each hand.
- **On desktop or with a game controller,** take the **radio remote** off the post (F, or A) and work both sticks from where you stand (see Controls).
- Its telescopic boom runs out up to 2 m further; HOOK sets a load down on the deck, the quay, or into the sea.

It lifts up to 800 kg out to the base boom's reach, and less the further out (its load-moment limit): it won't take a load it can't hold there, and stops the boom going further out with one on.

The page shows her in 3D (around her and at the helm), her figures and her sea trials, then gives her **code**: 17 characters, like `XXXXX-XXXXX-XXXXX-XX`, a few more for each piece of gear placed by hand, a deckhouse, or hull protection (older 10- to 15-character codes still work, and read with no hull protection). **Try her in the game** opens the game in her. Not while she'd capsize: a boat too slim and deep to float upright (GM under 0.15 m) is told so first among her warnings, and **Try her** stays greyed out until you give her more beam or less depth. A **tow winch** needs the **stern roller** to tow from: without it the Shipyard says so. Or add `?design=` and the code to the game's address, also on the Quest. Buying her at the boatyard in the game comes next.

**Bring her into the game (Menu → Office → Your boats):**

- **In the career, a boat costs money.** At a boatyard (Calder Haven, Loch Tarsk) the button reads **Buy her (£…)**: you pay the difference in price from your own boat (nothing back for a cheaper one), and she's your career's boat from then on. Away from a yard it reads **Sea trial (5 min)**: you sail her for five minutes and nothing from that time is saved, then you're back in your own boat. The Shipyard's **Try her in the game** is a sea trial too. In Voyage, Take her and Launch are free (it's a sandbox).

- **Your favourites:** every boat you've saved as a favourite in the Shipyard, in this browser, is listed there. **Take her** restarts the game in her. Nothing to type or paste, so it works in VR: design her in the Quest's browser, save her as a favourite, then pick her from the menu in VR (enter VR again once she's loaded).
- **Her code:** for a boat designed on another device (the favourites stay in the browser they were saved in), type her code on the page's keypad, a laser press a character (dashes don't matter, and I, L and O read as 1, 1 and 0). **Take her** lights once the code reads as a boat; the line above the keypad says what she is.
- **On desktop, paste:** copy her code or her **Try her in the game** link, then press Ctrl+V anywhere in the game (or the page's **Paste** button): it lands in the code line, ready to take.
- **Now** shows the boat you're in, with **Back to the workboat**.

**Design together:** press **👥 Design together** (top right), type your name and press **Start a session**, then send friends the link (**Copy link**). Everyone who opens it edits the same boat, live: a change by anyone shows for everyone. Each person has a colour and a name tag; you see where the others are pointing on the boat, and a slider someone is dragging shows their colour and name. **Undo** (Ctrl+Z) and **Redo** (Ctrl+Shift+Z) take back your own changes. There's no server and no account: the browsers talk directly, and each keeps its own copy, so the link still opens the boat later (from the copy in your browser) even when nobody else is there.

**Try her together:** in a session with friends, press **Try her together** (beside **Try her in the game**). Everyone in the session goes into the game in her at once, aboard one multiplayer game hosted by whoever pressed it. Nobody needs to type a game code. It always loads the latest version of the game. If someone's browser was still on an old copy, their page reloads by itself to catch up. To get back to designing, use the browser's Back button: it returns to the session.

**Sketches and pins:** sketches are for talking a change over, pins for deciding it.

- **✏ Sketch** takes a snapshot of the view as it is and opens it to draw on freehand, like marking up a screenshot; everyone in the session draws on it too, live, each in their own colour. Sketches are listed on the right (click to open).
- **Equipment (Deck gear, step 4):** a menu by the work it's for (**Rescue and firefighting, Towing, Fishing, Cargo, Her fittings**; click a heading to fold it), each piece on a card with a small drawing, a line on what it does, and whether she has it and where (green when she does). **Place** it, and a see-through copy follows your pointer over her: **green** where it will stand, **red** where it won't, with a few words why ("against the wheelhouse", "over her side", "on her other gear or a ladder"). Click on green to put it there; a red spot simply won't take it. To **move** a piece, point at it on her ("click to move it") and click, or press **Move** on its card; **R** turns the crane or winch while you place it, **Delete** takes off the piece under the pointer, **Esc** stops. Nothing gets written in the right-hand column as you place. Gear with only one place on any boat (the anchor, the stern roller, the A-frame, the side door) has **Fit** instead. Each fitted piece has **Take off**.
  - The **deck crane, searchlight, fire monitor and tow winch** stand **where you clicked**, snapped to a 25 cm grid: on deck, or (the searchlight and monitor) on the wheelhouse roof if you clicked the roof. Near a spot it can't stand on, the green copy shows the nearest clear spot within a metre, where it will go. The crane and the winch have a **Turn ↻** button to turn them a quarter at a time.
  - The **anchor and windlass** come on every boat (at the bow roller; a kedge at the stern on the ramp-bow boat), with an ANCHOR switch at the helm. The **skiff and her crane** go on the deck you pin (foredeck or aft deck), the crane on the side you pinned; she needs about 3.7 m of clear deck, so move the wheelhouse if it says there's no room. The skiff is a 3.25 m **rubber dinghy**: grey tubes round a flat floor, a small electric outboard and a tiller. Small enough for the fishing boat's foredeck and the small tug's aft deck. She takes three crates one behind another, or two drums. Or pick **Ship's boat: Rescue boat** (Deck gear step) for a **6 m fast rescue boat** on a bigger crane: a RIB with orange tubes, a **centre console** with a wheel, throttle, key, START and speed and rev screens, a leaning post to stand against at the helm, and one **150 hp outboard**: about 28 knots flat out, leaning into her turns like the planing boats. She needs about 6.8 × 4.4 m of clear deck, so she's for the big boats: the stern trawler (at her standard 20 m and longer), the small tug at her longest, the big landing craft. She sits in her cradle uncovered. Launch her and board her as you would the skiff. Then start her (the key and START on her console, or the quick start key), and drive her with the wheel and throttle (or the driving keys). A design with the rescue boat travels as a link or file; she isn't sold at the yard in the career. Her SKIFF CRANE button is on the dash. With her come two **midship cleats** on the bulwark tops, at the house end of the skiff's deck, for her painter: click one to lead the painter there (her bow alongside it), again to let go.
  - The **stern roller** and the **A-frame** go at the transom, the **life ring and boat hook** on the side of the house you point at, the **side door** in the port wall.
  - Placed gear stays where it was put, measured from the transom, when you stretch her.
- **📍 Pin** (on the view, any step): click on her and write a note for that spot ("cut the house down here"). Pins are notes only: gear and furniture are placed by pointing, as above.
- Pins are the design's **To do** list (right-hand column): click one to look at it, **Done** when it's sorted (done pins fade), ✕ to delete. They're stuck to her, not to the screen: stretch her and they stay on the same part of the boat. On your own (no session) all of it is kept in your browser.

**Variants:** **+ Fork** (in the tabs over the 3D view) copies the tab you're on into a new variant you name ("Amy's twin-engine version"), with its own pins and sketches; then try things there without touching the main design. Each variant is a tab (double-click to rename, × to delete); coloured dots show who's on which. **Compare** shows two side by side: her profile and plan at the same scale (sterns lined up), a list of what differs, and bars for their sea trials and figures. Tick values in the list and **Copy ticked values** to merge them into the first, or **Make it the main design** (the old main is kept as a variant). Works on your own too.

**The Wheelhouse step** is in groups: Size and place, Saloon aft, Windows, Roof, Inside and Deckhouse, each measurement on a fine slider in metres or degrees, rows showing only where they apply (the saloon's floor and roof with a saloon, the front's rake unless the windows are raked out all round, the side decks with a deckhouse set in from her sides). **The helm console:** in the Inside group, **Console** puts it in the middle or against the port or starboard wall (with a flat front: a faceted front's console wraps round the middle pane, so it stays in the middle, cut short the same). It's never longer than 2.2 m, so on a wide wheelhouse there's floor and glass beside it, and its screens stand in one row over the wheel where you can see them. **Offset** (the landing craft only; Size and place): a narrow wheelhouse moved across her to port or starboard, as far as her deck allows, leaving a wide working deck on the other side; everything in and on it goes with it (not with a deckhouse under it or an overhead aft). A boat with an offset wheelhouse travels as a link or file, not a code. **Console length** makes it shorter, down to 0.8 m, for a narrow wheelhouse (the wheelhouse can now be as narrow as 1.2 inside): the switch groups first close up onto the flat panel in front of the wheel, and only those that still don't fit move up onto the dash beside the screens, and the Shipyard tells you the shortest console that holds her instruments full size (shorter, they're drawn smaller). A touchscreen needs the least room. **Laying the console out yourself:** on the **Controls** step the view turns to the console from behind the wheel, with a **Console layout** panel under it: the dash's grid of screen cells with her screens on it, the switch panel's row of cells with her switch groups (LIGHTS, SEARCH · FIRE, the horn, DECK, ENGINE), and the wheel drawn across the middle. Drag a screen or a group to free cells (or click it, then click where it goes): the console in the view moves with it. Your first move pins everything where it stands, so the rest stay put; **Automatic** puts it all back as the Shipyard lays it out. If a placement stops fitting (say you shorten the wheelhouse), that one goes back where the rules put it, and the Shipyard says so. A console laid out by hand travels as a link or file, not a code. **The lining and floor inside:** in the Inside group, **Lining** chooses how the wheelhouse is finished inside: **Wood lining** (as before); **Light liner, beams** (a pale headliner with varnished wooden battens across the ceiling, dark charcoal walls, as in many aluminium pilothouses); **Dark liner, beams** (the same with a charcoal headliner); **Light all round, beams**; **Painted steel** (a tug's: pale green plating under a cream ceiling); or **Bare aluminium**. **Floor** chooses the floor: **Matting** (as before), **Teak planks** (dark teak laid fore and aft with pale caulked seams) or **Grippy utility** (a dark non-slip floor). Both are in her design code. **A saloon aft of the wheelhouse:** on the Wheelhouse step, **Saloon aft** runs the house on aft (up to 4.4 m) under the same roof, its door in the saloon's aft wall; **Saloon floor** puts its floor level with the wheelhouse's or one, two or three steps down (raise the wheelhouse floor to step down further), the steps made for you. **Saloon roof** keeps it under the wheelhouse's roof, or brings its own roof one, two or three steps lower, a step in the roofline like a raised pilothouse, its windows coming down with it (it won't go so low you'd duck in the doorway: step its floor down too). **Overhead aft** (in the Roof group) carries the house's roof on aft over the working deck, up to 4 m, on a curved wing each side, like a sport-fishing boat's cockpit roof: shelter for working the deck, and you walk under it. It stops short of the transom and of anything standing up through it (a searchlight or fire monitor pole, the A-frame), and isn't fitted when a deck crane or the skiff crane works her aft deck; the Shipyard says when it's shortened or left off. A boat with one travels as a link or file, not a code. **A cabin below:** in the Deckhouse group, **Inside: A cabin below** turns the deckhouse forward of the wheelhouse into the trunk of a cabin: its floor sunk into her hull so you can stand up, steps down from the wheelhouse floor beside the helm, and a V-berth in the bow. It needs the engine aft (pod drives, stern drives or outboards, or a shaft engine that sits aft) and a wheelhouse wide enough for the steps beside the helm; the Shipyard says when it can't fit and why. **The deckhouse's width:** one **Width** slider, from only as wide as the wheelhouse, through set in from her sides (side decks narrowing), to her full width; at full width it's a raised deck, her bulwarks and rails rising along it, their tops level with its top, and its top always walked out to them. **A fish hold:** on the Deck gear step, **Fish hold: Under the deck** fits an insulated hold in her hull under the working deck (where there's most room, clear of the engine and the houses), its hatch on deck on a coaming. In the game the trawl's boxes go down into it until it's full (the status line counts them), its weight low in her; open the lid and press the **yellow button** on the coaming to lift a box out onto the deck, then carry it ashore. **Furniture:** a step of its own, after Deck gear: a **berth**, a **settee**, a **galley** (a counter with a sink and a two-burner stove), a **seat** on a pedestal, a **locker** to the ceiling, **bunks two high** (for the crew; lie down in either), a **mess table** with a bench at each end, a **shower**, and a **head** (a toilet in its own compartment, with a door you press to open and shut). On this step the view looks straight down on her houses, cut just over the floor by the **✂ Section** tool (a waterline cut; slide it up or down, flip it or turn it off in its panel), so you can put in piece after piece without the view moving; the view and the cut go back as they were when you leave the step. **Add** one (or **Add another**: as many as fit, up to four of each; one head): the view looks straight down on her houses with the roof and the tops of the walls cut away, so you see the floor, the console, the stairs and the furniture already there; point where it goes (over the deckhouse for the cabin below): a see-through copy shows where it would stand, green, or red with why not ("not inside the wheelhouse", "no room here"); click on green, and the roof comes back and the view as it was. Point at a piece on her and click to move it, or press Delete to take it off. It stands on that floor with its back to the nearest wall, slid along the wall to the nearest spot clear of the helm, the doorways, the companionway, the chart table and the other furniture; each one on her is listed under its card (Berth, Berth 2...) with where it went, **Move** and **Take off** (the ones after it move up a number), and the Shipyard says when there's no room. You walk round it in the game. A boat with furniture travels as a link or file, not a code. **A deckhouse you can walk on:** in the Deckhouse group, **Top: Walked** puts a rail round the deckhouse's top and a ladder up to it from the main deck (on its aft face beside the wheelhouse when the deckhouse is wider than the house, else up its front), so you can walk round the raised wheelhouse; a **side door** in the wheelhouse can then open straight out onto it. **Roof top** (on the Paint step, under Roof) paints the roof's top in a second colour, set in from its edges so the roof's edge shows as a band round it. **Wheelhouse** (on the Paint step) paints the wheelhouse its own colour (white, cream, greys, red, blue, green, orange or yellow), or leaves it as her paint has it; **Window frames** makes the frames round the glass, and the posts between the panes, black or white. **Aft windows:** flat across, or **three facets** like the front's (Windows group, **Aft**): the middle pane square across her with the aft door in it, the outer two angled forward to the sides; the roof, ceiling and floor follow them, and what stands in the aft corners (the exhaust stack, the hand gear, the battery switches) comes forward to stay inside. With windows raked out all round they lean out with the rest, a tug's bridge all round. Not with a cockpit overhead; travels as a link or file, not a code. **Front windows:** on the Wheelhouse step, flat across or **three facets** (the middle square across her, the outer two angled back to the sides, as on a tug, with the dash wrapping round behind them). Widen the wheelhouse and the front windows multiply: more panes across (always an odd number, so you look through glass, not a mullion, from the helm), each with its own wiper; with three facets the side facets stay short and the middle one gets the extra panes. **Side & aft windows:** upright, or **raked out all round** like a tug's or supply vessel's bridge (the aft door then swings open on hinges, and there's no side door). **Window sills:** one height all round, standard, or **low** below the console: the console's upright panel comes off and its screens stand on stalks so you can see down over the bow; or **high**, 1.3 m up, level with the top of the dash (chest height, as on a heavy-weather trawler or tug: more wall, less glass, and you still see out over them standing at the helm; travels as a link or file, not a code). The wipers are sized to the windows. **Sheer:** on the Hull step, her deck line can sweep up toward the bow, up to 1.2 m more at the stem (nothing aft of amidships, rising fastest at the bow): a drier, more seaworthy look like a North Sea trawler's. A boat with extra sheer travels as a link or file, not a code. **A tiny tug:** the small tug's **Length** slider now runs down to about 7 m (her beam and depth shrinking less than her length, her ballast with her size): a 7 × 3.6 m tug of about 21 t. **Raised foredeck** (the fishing boat and the tug; Hull step): her deck stepped up forward of a break, from 1 to 15 m aft of the bow and 0.5 to 1 m higher (**Its height**), her sides and bulwarks stepping up with it, like a North Sea trawler's. A steep ladder each side up to it, against the break beside her bulwarks with a handrail, as on a real trawler, so the middle of the working deck stays clear; you walk up them. With the wheelhouse standing on it, **Inside: A cabin below** (Wheelhouse step) puts a fo'c'sle cabin under it, down a companionway from the wheelhouse. It never ends under the wheelhouse: if it would, it runs on aft past the house, which then stands on it, with a landing aft of its door (longer for a raised cabin floor, so the door's own steps come down onto it). Travels as a link or file. Picked fresh, the gillnetter's wheelhouse now stands forward of amidships with her working deck aft, as on a trawler, so a short raised foredeck ends just forward of it and a longer one runs on under it (move the house with **Position**). On the tug, whose wheelhouse stands well forward, most lengths run it on aft past the house (a harbour tug's forecastle with the wheelhouse on it); her push fender rises with the bow, and her towing hook stays on the low deck aft of the break. **Deck gear on a raised foredeck:** when the break is forward of the wheelhouse, a foredeck crane and the foredeck skiff (with its crane) go up on the raised foredeck if it has room for them, else on the deck below it; nothing stands across the break or on the ladders, and the Shipyard says when something goes on the lower deck or is left off. **Rails:** on the Hull step, handrails over her bulwarks or none. **✂ Section** (with Pin and Sketch over the view) cuts her through: **Waterline** (level), **Buttock** (upright, fore and aft) or **Station** (upright, across her), slid anywhere along her with the slider (it says where: above the design waterline, off the centreline, forward of the transom). The view turns square on to the cut; **⇄ Flip** keeps the other side, **Look at the cut** turns back to it after you've turned the view, **Off** puts her back whole. The cut stays on while you change her and move between steps. **Flat view** (with the view buttons) draws her with no perspective, like a drawing: Side is her profile, Plan her plan. **Hull: solid / see-through** and **Wheelhouse: solid / see-through** (beside Water on/off) turn either one see-through or back, on any step: say the hull solid at Engine, or the wheelhouse see-through at Deck gear to see the console inside. Each step starts with its own view again.

**Projects:** the Shipyard opens with no boat on the table and asks: start a **new project** (give her a name), **open** one you've saved, or start one **from a favourite**. A project is all of a piece of design work — the brief, the design and its variants, their pins and sketches — and it **saves itself as you work** (no Save button), under her name (rename her at the top and the project follows). Reloading the page keeps it open; **📁 Projects** in the header shows your projects, opens another (this one is kept) or **Close project** takes you back to the start. A link or code to a boat opens straight in, as a new project. Work left from before this change is kept as a project called "Unsaved work". Kept in this browser, like the favourites; not while designing together (leave the session first).

**Favourites:** name a design and **Save to favourites** to keep her in a list on the page, with a small picture and her figures: **Open** her again, **Try in game**, or **Delete**. Saving again under the same name updates it. The list is kept in this browser on this device (the Quest's browser and your desktop each have their own); to move a design between them, use its code.

## Local development

You need Node 20+ (22 recommended).

```bash
npm ci            # install exact locked versions
npm run dev       # HTTPS dev server on https://localhost:5173 and your LAN IP
npm test          # unit tests (physics/sim run headless in Node)
npm run build     # typecheck + production build into dist/
npm run trials    # hydrostatics, GZ curve, inclining + free-decay tests, sea trials (see docs/TESTING_NEW_BOATS.md)
npm run preview   # serve the production build over HTTPS on :4173
```

> Use `npm ci` rather than `npm install`. npm 10 has a bug ("Cannot read properties of null (reading 'edgesOut')") that is triggered by vitest's optional peer dependencies. If you need to add a package, run `npx npm@11 install <pkg>`.

### Testing on the Quest from your own PC (optional)

The GitHub Pages URL is the easy route. To test uncommitted changes instead:

1. Make sure the PC and the Quest are on the same Wi-Fi.
2. Run `npm run dev`. Vite prints a **Network** URL such as `https://192.168.1.23:5173/`.
3. Open that URL in the Quest browser. The certificate is self-signed, so choose **Advanced → Proceed** once. WebXR requires HTTPS.
4. If the Quest can't reach the PC, allow Node through the PC firewall on port 5173.

**USB alternative:** connect the Quest with a cable, run `adb reverse tcp:5173 tcp:5173`, then open `https://localhost:5173` on the headset.

### Testing VR without a headset

Install Meta's **Immersive Web Emulator** extension (Chrome or Edge Web Store). Then:

1. Open the dev URL.
2. Open DevTools (F12) and go to the **WebXR** tab.
3. Pick **Meta Quest 3**.
4. Click **Enter VR** on the page.

You can move the emulated headset and controllers and press their buttons from the DevTools panel.

## Performance on the Quest

Open the perf panel in VR with B (or from the menu). At 90 Hz the frame budget is 11.1 ms.

- **FPS below 90 while cpu is low:** the GPU is the limit. In `src/config.ts`, lower `xr.framebufferScale` or raise `xr.foveation`.
- **cpu near the budget:** the main thread is the limit. The sim / views / render split shows which part.
- **gpu:** shown only where the browser exposes the timer extension; otherwise it reads "n/a".

## Hull study (work in progress)

`hulls.html` (live at [tartanski-cpu.github.io/SWVR/hulls.html](https://tartanski-cpu.github.io/SWVR/hulls.html)) shows thirteen workboat hull types, from a 10 m gillnetter to a 26 m multicat (and the small push tug, the stern trawler and a fast catamaran workboat), generated from design curves, with their hydrostatics. **As the game draws her** shows a hull as the game itself builds and draws it (hard-chine hulls, and now catamarans too; a round-bilge one says it can't be taken yet). It is groundwork for modular boats and not part of the game yet.

## Multiplayer

Co-op crew on one boat, peer-to-peer (one player hosts). Menu → **Crew** → **Host a game** shows a 5-digit code; the others type it on the keypad and press **Join**. If the game can't be opened (the introducing server is slow or down for a moment) it tries again a few times by itself and says so on the screen. Everyone must be on the same build of the game: each page checks at start that it's the build the site is serving now and reloads itself if it's behind, so after a push you don't need to clear anything; if a crew-mate's page is newer than the host's all the same, the host is told to reload (Ctrl+F5) and host again. Everyone can use every control. Crew-mates appear as an upper-body figure in working clothes (a random outfit each time you join: oilskins and sou'wester, float coat, fisherman's jumper, hi-vis and hard hat, bib-and-brace, crew jacket), with arms that bend at the elbow and gloved hands that turn as theirs do; their player colour is on the hat and collar.

**Talking** (off unless you switch it on: **Menu → Crew → Voice chat: On**; then allow the microphone when the browser asks; up to four players). Off, your microphone isn't used, you hear no one and you have no radio.
- **Nearby** you hear each other as you would on deck: from where they stand, fading out over about 20 m. It's always on.
- **The handheld VHF** clipped high on your left shoulder: hold it to talk (VR: grip it, then hold the trigger; desktop: hold V; game controller: hold View). You hear the talk button click and the squelch open and close. Everyone within about 5 km hears you on their radio: one channel, no direction, the tinny radio sound, a squelch at each end and some hiss near the edge of the range. You can't hear the radio while you're talking on it.
- **Menu → Crew** shows how many you're connected to and lets you mute your microphone. Its volume is **Settings → Sound → Crew voices**.

Details and limits: [`docs/MULTIPLAYER.md`](docs/MULTIPLAYER.md).

## Testing a new boat

There's a built-in "sea-trials lab". It covers hydrostatics, the GZ curve, an inclining experiment, free-decay motions, and speed/turning/stopping trials, all computed from the same hull the game floats. See [`docs/TESTING_NEW_BOATS.md`](docs/TESTING_NEW_BOATS.md). A snapshot of the project at that stage lives on the `sea-trials-lab` branch.

## Project layout

```
src/
  config.ts        every tunable number (waves, mass, thrust, drag, comfort, perf)
  app/             top-level wiring: App.ts (renderer, frame loop in named phases, XR session setup,
                   desktop mouse, test scene); careerSession.ts (career save slots, saving, menu parts);
                   laserPointer.ts; soundBoard.ts (every sound system, unlocked on the first gesture);
                   interiorDetail.ts (hides small wheelhouse parts from outside)
  core/            fixed-step loop, ids, intents, WorldState, Simulation.step, math, keyboard
  environment/     time of day + sea state; sun direction, sky/fog/light palette; sky dome
  player/          player state, rig (moving-frame parenting), desktop controller, XR input
  debug/           overlay (FPS, cpu/gpu time, draw calls; DOM on desktop, wrist panel in VR),
                   GPU timer, buoyancy view, surface probes, sea-trials panel
  ocean/           waves.ts (Gerstner maths shared by CPU physics and the shader), grid, shaders, view
  render/          geometry helpers (vertex-coloured, merged, flat-shaded parts)
  vessel/          hull form (stations), vessel defs, state, physics (strip hydrostatics,
                   damping, rigid body, engine/prop/rudder, fuel + thermal, contacts, anchor),
                   walk areas, sea trials, view (hull mesh, nav lights, smoke, anchor chain)
  world/           archipelago level data, terrain height, shelter zones, quay/pier queries,
                   view (terrain, structures, trees, harbour lights)
  ui/              the in-game menu (canvas panel, tabs, wrist mount, poke/point)
  controls/        Control base, Lever, Wheel, Button, Toggle, interaction system, bridge, instruments
  audio/           synthesised engine and horn (WebAudio, no files)
  net/             multiplayer: messages, PeerJS / loopback transports, host and client sessions, avatars
  tow/             towing: tow jobs and the towline on anything afloat (tow.ts), tow models, towline view
  wildlife/        gulls and dolphins (poses from time; view)
  career/          money, ledger, reputation, contracts, upgrades, repairs (career.ts); first voyage (tutorial.ts)
  salvage/         log salvage: beach spots, logs, their physics on the line; view
  fishing/         the trawl: net, grounds, catch, drag; A-frame/warps/floats view
tests/             vitest: run in plain Node, no browser
docs/              TESTING_NEW_BOATS.md (sea-trials lab, adding a boat), MULTIPLAYER.md (co-op)
```

### Architecture rules

1. **Input → intents → simulation → state → views.** Inputs never change simulation state directly. They push `Intent`s, which the simulation applies on its fixed 60 Hz tick. Views read state and interpolate between ticks.
2. **State is plain data.** `WorldState` holds only JSON-serializable objects with stable string ids. There are no Three.js objects in it.
3. **Simulation code imports no DOM or scene graph.** `tests/simulation.test.ts` runs it headless in Node.
4. **The local player is just `world.players[localPlayerId]`.**
5. **Static geometry is merged and vertex-coloured into as few draw calls as possible.**

## Dependencies

| Package | Kind | Why |
|---|---|---|
| `three` | runtime | Rendering and WebXR. Its bundled addons provide the VR button, geometry merging and (later) controller models. |
| `vite` | dev | Dev server and bundler |
| `typescript`, `@types/three` | dev | Type checking |
| `@vitejs/plugin-basic-ssl` | dev | Self-signed HTTPS for LAN testing (WebXR requires a secure context) |
| `vitest` | dev | Unit tests for physics and sim, run in Node |
| `peerjs` | runtime | Multiplayer: WebRTC data channels between players; its free public server only introduces them (about 30 KB gzipped) |
