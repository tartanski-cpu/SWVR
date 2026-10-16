# SWVR

A browser-based VR sea rescue and operations game: chunky flat-shaded boats that you operate from the inside, with physical levers, wheels, switches and live instruments. It's built with TypeScript, Vite, Three.js and WebXR, and targets the Meta Quest 3 and desktop browsers.

**Status:** MVP complete (milestones 1–7). A snapshot lives on the `mvp-1` branch. See [`PROGRESS.md`](PROGRESS.md) for what's done, what's next and known issues. Feature ideas and their status are in [`ideas.md`](ideas.md).

What's in the MVP:

- **A moderate Gerstner sea**, with physics and rendering sampling the same surface.
- **A 12 m displacement workboat** floated by strip-theory hydrostatics. It has a slow-revving diesel, gearbox and prop, a rudder and prop walk.
- **A walk-in wheelhouse**, a ladder to the roof, and grab-the-world locomotion.
- **Physical bridge controls** (wheel, throttle/gear lever, start/stop, horn, nav-light switch) with live instruments.
- **Nav lights** with proper arcs of visibility, exhaust smoke driven by engine load and temperature, and synthesised engine and horn audio.

Since the MVP:

- **VR wrist menu.**
- **Fuel and engine temperatures:** an engine monitor, alarms and refuelling.
- **A small archipelago** with three kinds of port (see below), groundings and collisions, an anchor and windlass, sheltered water and an echo sounder.
- **Cargo runs** between the ports, with real deadweight.
- **Wake and spray:** foam that rides the swell, spray when the bow slams, and water and splash sounds.

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
| O | Menu, floating in front of you: aim and click (same menu as in VR) |
| Z (hold) | **Binoculars**: 7x zoom through two lens circles (the key left of X, so Y on a German keyboard) |
| W A S D | Walk (walls, furniture and the deck edge stop you; hold Shift to **run**) |
| F | Toggle walk / free-fly camera (Space / C = up / down when flying) |
| Space / C at the ladder | Climb up / down (walk forward off the top onto the roof) |
| Space (elsewhere) | **Jump**: off the boat onto a quay, from a quay aboard, or into the sea. Swimming near the hull, the swim ladder or a quay: climb out |
| Click a cargo item | Pick it up (carried in front of you); click again to set it down |
| Q on cargo on deck | Lash it to the nearest D-ring / release it |
| Right mouse button (hold) | **Laser pointer** to the reticle (the beam comes from your lower right); the crew sees the beam and dot |
| Click the searchlight or fire monitor joystick, or the skiff's tiller or gear lever | Steer it with **W A S D** (you don't walk meanwhile) while the mouse still looks around; click again to let go. You don't walk while dragging a lever or the wheel either |
| B | Board the boat (you appear at the helm) / go ashore onto the quay |
| Aim **+** and click / drag | Operate the bridge controls (see below) |
| E | Debug: engine start / stop |
| ↑ / ↓ | Debug: throttle/gear lever ahead / astern |
| ← / → | Debug: wheel to port / starboard |
| X / G | Debug: lever to neutral / wheel amidships |
| T | Hydrostatics + sea trials report |
| L | Weather: switch to the next preset (Clear / Overcast / Fog / Rain / Squall), changing over a minute |
| 9 / 0 | Motion coupling −/+ 10 % (desktop has its own setting, 30 % by default: the view soaks up the boat's quick roll and heave; in the wheelhouse or with the reticle on a control it rides rigidly with the boat, so the console holds still to click) |
| R / K | Test: drop the boat from 4 m / heel her 20° and release |
| V | Buoyancy debug view on/off |
| N / M | Time of day −/+ 30 min |
| F3 or I | Debug overlay on/off (FPS, cpu/gpu frame time, draw calls, boat readouts); off at start |
| P | Wave surface probes on/off |
| F1 or H | Help panel on/off |

### VR (Quest 3)

| Input | Action |
|---|---|
| **Grip** with your hand on the throttle lever or wheel | Grab it; it follows your hand (not where the controller points). Two hands work on the wheel |
| **Trigger** touching a button or switch | Press it (start/stop, horn, nav lights) |
| Trigger pointing at a button or switch a little out of reach | Pointer-ray fallback for buttons and switches only (a blue line shows the target) |
| **Grip** on empty air + pull | Move (grab the world) in any direction, up and down too, through the wheelhouse walls, but not out over the side: a fence at the boat's edge stops you (and the stick) at the bulwarks. To go over the side, jump (A). Wherever you pull yourself to, you stay at that height until you teleport, board or jump, so seated play works without crouching. Two grips + twist: turn. In the water these are your swimming strokes |
| **A** | **Jump** (off the boat, onto a quay, into the sea) |
| **Right stick click (hold)** | **Laser pointer** from the right controller; the crew sees the beam and dot |
| **Grip** on a cargo item | Pick it up; it follows your hand. Items over 60 kg need both grips on them. Let go to set it down: on the deck over the boat, ashore over land, lost in the sea |
| **Trigger** touching cargo on deck | Lash it to the nearest D-ring (orange straps) / release it |
| **Grip** on the gunwale or transom while swimming | Haul yourself aboard (A near a quay climbs out there) |
| **Grip + pull down at the ladder** | Climb (aft face of the wheelhouse, up to the railed roof). Push up to climb down |
| **Y** | **Menu** on your left wrist (see below) |
| Left stick | Walk (head-relative; can be switched off in the menu). Push it right to the edge to **run** |
| Right stick ← / → | Snap turn (30° by default; 15/30/45/90° in the menu) |
| Left stick click | Board the boat (at the helm) / go ashore onto the quay |
| **Grip** the boat hook (port bulwark) | Take it; it points along your controller. Touch a floating crate or a tow's bow eye with the tip to hook it. With **auto-extend** (menu Comfort → Boat hook reach, on by default) it telescopes out to whatever you point it at, up to 8 m, then slides back in with the crate on it. Desktop: click the hook, then click the crate or bow eye |
| **X** | **Crouch** / stand up (drops your view and hands 0.6 m; desktop: C) |
| **Trigger** on the red key on the yellow plate (aft wall, by the door) | **Battery master** on / off. The boat starts cold and dark: master on first (voltmeter by the helm, under the starboard window) |
| **Starting the engine** | Follow the card by the key: battery MASTER on (aft wall), INSTR breaker on, throttle in neutral, KEY on, hold HEAT until the GLOW lamp goes out (about 2.5 s cold, well under a second once the engine is warm), hold START until she runs. Stop: key off. Battery selector (1 / BOTH / 2) beside the master. The duty board on the starboard wall ticks off the start-up steps, and lists the jobs on: the cargo job, and any rescue or tow under way. Desktop E: hint (or quick start if enabled in config) |
| **Trigger** on a breaker (panel by the helm, under the starboard window) | Breakers: Instruments, Chart, Radio, Nav lights, Deck lights, Bilge, Deck hydraulics (DECK HYD). A device works only with the master and its breaker on; a green lamp shows the circuit is live |
| **Trigger** on a green **skiff crane** button: SKIFF CRANE on the helm console (DECK group), the crane's control box (outboard side of its post, from the starboard side deck), or the remote on a post in the skiff by the helmsman. Or Menu > Boat > Skiff | Launch the skiff / recover her (she must be alongside the starboard bow and moving with you). Its hover text says which, or why not yet. In the cradle she's under a tarpaulin (launch her before boarding) and the crane is folded down along the starboard foredeck; LAUNCH unfolds it, hooks on and lifts her out |
| **Grip** on the skiff's tiller, then **trigger** | Steer by swinging the tiller; the same hand's trigger is the throttle (let go = idle). Red button on the motor: on/off; yellow lever on its side: forward / neutral / reverse |
| B | Debug/perf panel on your left wrist (off at start): FPS, cpu/gpu frame time, draw calls, XR resolution, boat readouts |

### VR menu (Y)

The menu stands above your left hand. Use the **right** controller on it in one of two ways:

- **Poke:** push the tip of the controller into a button.
- **Point:** aim the ray (an orange line) and pull the trigger.

While your right hand is on the menu, its trigger doesn't reach the bridge controls behind it. If the left controller isn't tracked, the menu floats in front of you instead.

The menu is laid out for playing. Some tabs have sections, picked from a second row under the tabs.

| Tab | What's on it |
|---|---|
| Voyage | The job you're on (contract, cargo run or rescue, with **Abandon**), what you've done; the **weather** now and what's coming; time of day ±1 h and time flow stopped / ×60 / ×600; bearing and range to each port; the paper chart's marks, with **Clear marks** |
| Boat | **Deck:** tow (**Make fast** / **Cast off**), docking (**Dock** / **Cast off**), anchor status. **Skiff:** board, **LAUNCH** / **RECOVER**, battery. **Fuel** and **Refuel** (at a fuel berth). **FM radio:** power and station |
| Cargo | Where you are, payload, deliveries; cargo aboard (lashed or loose), and what's in the skiff (two crates or one drum) |
| Office | **Jobs:** balance, the contract on, the harbour office's job board, the first voyage (**Skip** / **Again**). **Yard:** repairs and the chandlery (upgrades), in port. **Career:** balance, reputation, ledger, the three save slots |
| Crew | Multiplayer: host or join a game, your name, who's aboard |
| Settings | **Comfort:** motion coupling ±10 %, stick walking, snap-turn angle, boat hook reach. **Sound:** volumes. **Game:** rain effect, rescue position (on the plotter, or plot it yourself), and the **Debug tab** (hidden / shown). Remembered on the device |
| Debug | Hidden until **Settings → Game → Debug tab → Shown**. **World:** time ±10 min, weather presets, **Fixed weather** / **Fast ×10**, sea state and wave height, move to a port, board / leave the boat. **Boat:** drop 4 m, heel 20°, damage, electrics, start-up, oil, bilge, engine faults, sea trials. **Missions:** rescue, tow, fire, side jobs and traffic on demand, +£5000. **Views:** perf panel, buoyancy, wave probes, targets on the chart, radio voice test |

### Bridge

At the helm, from left to right on the console:

- **Nav lights** toggle switch.
- **Anchor** switch: down = let go (the chain pays out to 4 × depth + 5 m), up = heave in and stow. You hear it: the chain rattles out over the bow roller and the anchor splashes in; heaving in, the windlass hums and the links clank in one by one, with a clunk as it stows.
- **SPOT** switch (far left): the searchlight on the wheelhouse roof.
- **Searchlight joystick:** on the pedestal to port of the wheel, under your left hand. Grip it and push sideways to pan, forward/back to raise/lower the beam. The further you push, the faster it moves; let go and the light stays put. On desktop, click and drag it.
- **Cabin** light switch: the wheelhouse ceiling lamp, three-way. Each press steps **off → white → red → off**: the bat is in the middle for off, forward for white, and aft for red. Red is dim, for night work: you can see the controls without losing your night vision.
- **WIPERS** switch (far port end): the three pendulum wipers on the front windows. They need the INSTR breaker; switched off they finish the sweep and park.
- **DOCK** button (blue, right of the wheel): lights up when you're in a berth's hot spot (any quay or pier face with water alongside). Press it to dock; press again to cast off.
- **Horn** button (hold).
- **Wheel**: 1.5 turns lock to lock. Hydraulic steering, so it stays where you leave it.
- **Throttle/gear lever**, on a pedestal starboard of the wheel so it falls to hand: forward = ahead, back = astern, with a notch at neutral.
- **Start/stop** button. The engine only starts with the lever in neutral.

Warning lamps in front of the key: **OIL**, **CHARGE**, **GLOW**, **NEUTRAL** and **BILGE** (blinks with water in the bilge).

**The console, port to starboard.** The switches are grouped on colour-coded plates:
- **LIGHTS** (yellow): nav lights, cabin light, wipers.
- **SEARCH · FIRE** (red): the fire pump and searchlight switches, each just ahead of its joystick. The fire monitor joystick (red knob) and the searchlight joystick (yellow knob) stand side by side on pedestals to port of the wheel: aim with the left hand, keep the throttle in the right.
- The **horn**, just left of the wheel.
- **DECK** (blue): DOCK, anchor, trawl, behind the throttle.
- **ENGINE** (green): HEAT, START, the key, the warning lamps, and the start-up card.

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
- Marks are saved in the browser, so a route plotted before leaving is still there after a reload.
- In multiplayer, crewmates see the marks appear as you draw, and several people can draw at once.
- **Plot it yourself** (Menu → Settings → Game → Rescue position, or `rescue.plotYourself` in the config; off by default): rescue calls give only the last known position in latitude and longitude, and the chartplotter doesn't show the search area. Plot it on the paper chart, using the latitude and longitude scale on the chart's edges.

- **Reading it on desktop:** aim the crosshair at the chart from the table and the view eases in, as if you leaned over it; look away and it eases back.
- It's printed like a real chart: depth tints and contours, soundings in metres, a latitude and longitude scale in tenths of a minute around the edge, and a compass rose.
- **At night** you need the chart table lamp (or the cabin light) to read the chart.

### Transit jobs and closing up

- **Fenders:** press the fender basket on the aft deck (starboard) to put all six out over the side, or take them in.
  - Coming up to a berth with them in puts "Coming alongside: fenders out" on the duty board.
  - Out of harbour with them still out gives "Under way: fenders in".
- **Lash the cargo:** under way with loose cargo on deck, "Under way: lash the deck cargo" comes up.
- **Engine oil:** the engine burns a little oil. Every 15 minutes of running, "Engine check: oil" comes up.
  1. Open the **engine hatch** in the wheelhouse floor, aft on the starboard side: press its yellow lifting ring and it swings up against the wall. The engine is below. While it's open you can't step into the hole; press the ring again to shut it.
  2. Pull the **dipstick** (yellow ring) on the engine's inboard side. It tells you whether the oil is fine or low. (The dipstick and the oil can only work with the hatch open.)
  3. If it's low, press the red **oil can** on its shelf beside the engine to top up through the yellow filler cap.

  Nearly dry, the OIL lamp blinks while running.
- **Wheelhouse door:** the aft door has a window and slides open or shut with the **green push button** on its starboard frame, inside and out (trigger in VR, click on the desktop). The door itself isn't a button any more, so it can't catch your hand at the whiteboard. It starts open, and when shut it blocks desktop walking.
  - **Sound:** on deck the engine is at full noise. Inside the wheelhouse it's a little quieter and duller; with the door shut it's much quieter and duller. Shutting the door also muffles the wind, rain, hull wash and fires inside.

### Traffic and hazards

- **Passing ships:** four AI ships (coasters, fishing boats, yachts) are always about, crossing ahead some way off on deep-water tracks; a new one comes along when one has passed.
  - They show on the chartplotter as **AIS** triangles with their name and a 6-minute course line, in any visibility.
  - They carry navigation lights at night.
  - The lookout calls each one out with a clock bearing and range.
- **In fog** ships sound a prolonged blast every 2 minutes, and the nearest one answers yours. Listen for where it comes from.
- **Hazards:** floating debris, the rocks at Gull Rocks and the Skerry, and yellow/red hazard buoys.
- **Debug:** Menu → Debug → Missions → Traffic → **Spawn ship** / **Spawn debris** (close by).

### Weather work

- **Shipping forecast:** the coastguard reads it out on the VHF every 6 minutes and soon after the weather turns: wind, sky, visibility, and what's coming and when. You only hear it with the RADIO breaker on. The last one received stays on the **duty board** (starboard wall) with its time.
- **Rain:** drops build up on the front windows; the wipers clear them. They are pantograph wipers hung from the header above the glass, so each blade stays upright and clears a broad band at eye height, then parks upright by the window post. Rain drums on the roof inside and hisses outside.
- **Squalls:** gloomy light, lightning flashes, and thunder after them (count the seconds: about 3 s per km).
- **Deck hydraulics:** the skiff crane, the tow winch and the trawl's net drum are hydraulic, driven by a pump on the engine. They only work with the **engine running** and the **DECK HYD** breaker on. Without pressure a machine stops where it is and holds its load (the skiff hangs on the crane), and carries on when the pressure comes back. Press a machine's button without hydraulics and a note says what's missing. You hear each one working: the pump's whine, oil hissing through the valves, the drum or slewing gear rumbling, a clunk as the valve opens and closes, and the relief valve hissing when the winch stalls against too heavy a pull.
- **Bilge:** a damaged hull leaks (see damage below): the BILGE lamp blinks and the bilge pump (BILGE breaker) pumps it out.
- **Duties** the weather puts on the duty board:
  - **Rain/Squall coming: secure the boat:** with loose cargo on deck, lash it (wipers on is optional).
  - **Restricted visibility** (under way in fog): nav lights on, and a prolonged blast on the horn (4 s or more) every 2 minutes until it clears.
  - **Bilge alarm:** BILGE breaker on and pump her dry.
- **Spotting:** the lookout calls out anything in the water as it comes within sight (900 m, or the visibility in fog), with a clock bearing. Survivors wave once they can see you; their strobe shows only a little beyond the visibility, but the whistle carries.

The dash shows:

- **Speed** (kn), with **depth under the keel** (red below 2 m).
- **Heading** (compass tape).
- **Engine RPM**, with gear, engine state and load.
- **Rudder angle**: the needle is the actual rudder, the ring is the helm order.
- The **engine monitor**, behind the wheel (read it through the spokes): coolant and oil temperature, fuel litres and L/h, and HIGH TEMP / LOW FUEL lamps. A buzzer sounds with the alarms.

### Engine management

- **Fuel:** the tank holds 600 L. Flat out burns about 49 L/h; 6–7 kn about 11 L/h. Run dry and the engine stops; it won't restart until you refuel.
- **Cold start:** the engine starts cold and smokes white until it warms up, which takes about 5 minutes under way.
- **Overheating:** with the pump-failure fault on, it overheats under load. The alarm sounds at 95 °C, power is derated from 100 °C, and it shuts down at 115 °C. Ease off before that.

### NAV / WIND display and binoculars

- **NAV / WIND** (overhead, just forward of the light switches; glance up from the wheel):
  - your position (latitude and longitude);
  - speed and course over ground, heading;
  - the true wind (direction it blows from, knots, Beaufort force);
  - a dial with the apparent wind (what you feel on deck) relative to the bow.
- **Binoculars** lie on top of the dash, port end. VR: grip them to pick them up and raise them to your eyes for a 7× view; let go and they go back. Desktop: hold Z.

### Fire missions

Out of harbour, with no other job on, a fire is reported on the VHF every 5–11 minutes. It's either a fishing boat burning at sea, or a shed ashore that you can reach from deep water. Pick up the handset to take it; the plotter marks it **FIRE**.

1. **Engine running, FIRE PUMP on.** The switch is on the console, left of the wheel (SEARCH · FIRE group). The pump is engine-driven, so there's no water with the engine off.
2. **Aim the fire monitor** on the wheelhouse roof with its joystick (red knob, on its own pedestal at the port end, beside the searchlight's). Sideways pans it, forward and back raises and lowers it. It's **stabilised**: as she rolls and pitches it holds its aim (you'll see the barrel move on its mount), so you only correct for your own heading and the drift. The jet flies a real arc, carried by the boat's way and blown a little by the wind.
3. **Keep the jet on the fire.** The smoke turns to white steam when you're on target, and the radio line shows how much is left. Left alone, a fire grows. About a minute of steady hosing puts out a big one.
4. **Out:** the coastguard thanks you, and it counts as a mission.

The duty board walks you through it. The menu's Debug → Missions section has buttons that light one close by (Boat, Shore), raise a call, or end it.

### Towing missions

Out of harbour, with no rescue on, a tow call comes over the VHF every few minutes: something adrift a few hundred metres ahead. It's a broken-down motor cruiser, a raft of logs, or a work barge.

1. **Pick up the handset** to take the job. The tow shows as an orange **TOW** diamond on the chartplotter.
2. **Come alongside with your stern to her bow.** Our line leads from the tow winch aft over the **stern roller**, in a notch in the middle of the transom bulwark; her **bow eye** is the orange ring on her stem.
3. **Make fast:** take the boat hook, then touch the bow eye with its tip (VR) or click the bow eye (desktop). The menu's Boat tab has a **Tow → Make fast** button too. Our stern must be within 16 m of her bow. To **cast off**, do the same again with the line fast (hook on the bow eye), or use **Tow → Cast off** on the menu.
4. **Tow her into any harbour.** The line goes out 22 m and is stretchy. Take up the slack gently: snatching it at speed (or dragging her over rocks) parts it, and you have to go back and make fast again.
   - **The tow winch** just forward of the stern roller works the line by hand (engine running and DECK HYD on). The line is made fast at the distance to the tow plus a metre, so heaving in starts bringing her closer at once: hold **HEAVE IN** (green) or **PAY OUT** (amber) on top of its gearbox housing (starboard end), standing forward of it facing aft. It comes in at 0.6 m/s and goes out at 1 m/s, from 4 m to 60 m, and stays where you leave it. Heaving in against a heavy pull (over 18 kN) stalls it: ease off or slow down. The status line shows the line out and its pull.
5. **Slow down inside the port** for a few seconds and the harbour takes her over. The tow counts as a mission, and she is taken away a few seconds later.

Unanswered calls go away after two minutes. The menu's Debug → Missions section has buttons that put a tow just astern (Cruiser, Logs, Barge), raise a call, or end the job.

**Tow anything in the water.** The towline isn't only for tow jobs. Make it fast the same way (hook or menu) to:
- **any boat afloat**, at her bow, e.g. our own skiff once she's off the crane;
- **floating debris** (the planks-and-drum hazards). Towed slowly into a harbour, it's cleared away, and the harbour thanks you.

One thing at a time on the line. The menu's **Tow → Make fast** picks the nearest thing within 16 m of the stern roller. Floating crates from lost cargo still go on the boat hook, not the towline.

### Career: money, reputation, contracts, upgrades

Everything you do now earns or costs money. The menu's **Office** tab is your harbour office: **Jobs** (contracts), **Yard** (repairs, upgrades) and **Career** (balance, reputation, ledger, save slots); the **duty board** shows your balance (top right) and any contract on.

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
- **Chandlery (upgrades, bought in port):**

  | Upgrade | Price | Needs (best port reputation) | Effect |
  |---|---|---|---|
  | Radar | £2,400 | 20 | Debris and floating crates show on the chartplotter within 1.5 nm |
  | Heavy towing post | £1,500 | 10 | The towline takes 75 % more before it parts |
  | Bigger trawl | £1,800 | 10 | The net fills half as fast again |
  | Ice machine | £1,200 | — | Fish fetch 30 % more |

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
- **Playing together:** when you host, the duty board shows the **game code** for your crew to read off the wall. Menu → Crew lists who's aboard, and the last code you joined is remembered. Crew-mates play the host's career.

### Damage, wear and weather

- **Hull damage:**
  - **What causes it:** hitting anything (rocks, a quay, the bottom) faster than about 2 knots, or grinding over the bottom under power. Normal docking does none.
  - **What it does:** a damaged hull **leaks** into the bilge. At about half damage the leak is faster than the bilge pump. Water in the bilge is real weight (a full bilge is 3 t), so a flooding boat sits deeper and handles heavier.
- **Engine wear:**
  - **What causes it:** running hot (coolant over 98 °C) or with the sump nearly dry.
  - **What it does:** a worn engine loses power, down to half at full wear.
- **Repairs:** Office → Yard → **Repairs**, in port.
  - Hull: £30 per % of damage, and the yard pumps her out.
  - Engine overhaul: £25 per % of wear, with the engine stopped.
  - Repairs can go on credit, so you can always get back out.

  Damage and wear carry over between sessions with the career. The duty board lists both while they're there.
- **Heavy weather:**
  - **No trawling** in a sea over 2.2 m (Hs): the net jumps off the bottom.
  - **Danger money:** rescues, tows and fires in a squall, or in a sea over 1.8 m, pay 50 % more.
- **Debug:** Debug → Boat → Hull → **Damage** (30 % hull damage and 30 % engine wear).

### Log salvage (side job)

Now and then timber washes up on a beach, and the VHF says where ("timber reported washed up on the north shore of Tarran"). Logs show on the chartplotter as brown **LOG** marks; there are up to three about at once.

1. **Stand off the beach, stern to it.** It's shallow close in, so stay in 2 m or more of water. The line to a log is 30 m, so the boat can lie well off.
2. **Make the line fast:** with the boat hook in hand, click the log (desktop, up to 30 m away: the line is thrown to it). Or use the menu's **Tow → Make fast**, which also works in VR.
3. **Pull it off.** A log on the sand doesn't move until the line pulls harder than its friction (about 8 kN), so ease ahead and then give her more power. It slides down the beach and floats.
4. **Tow it into any harbour** and slow down there for a few seconds. The yard buys it and the radio keeps count.

Logs nobody comes for go again after half an hour. The menu's Debug → Missions section has **Side jobs → Log on beach** to put one on the nearest beach.

### Fishing (side job)

The boat has a trawl: a red A-frame over the transom with a block each side on its crossbeam, its warps off the tow winch.

1. **Find a fishing ground:** the dashed teal rings on the chartplotter (Skerry Ground near the start, Calder Bank east of Calder Holm, The Hollows to the north-west).
2. **Shoot the net:** the **TRAWL** switch on the console, behind the throttle (DECK group), runs it all the way out; or work it by hand with the **PAY OUT** / **HAUL** buttons on the control box on the A-frame's starboard leg (hold to run; it stops where you let go, part way out it drags but doesn't fish). The warps run out astern and the net's orange floats show on the surface. You'll feel the drag: the engine has to work.
3. **Tow at 2–4 knots** inside the ground. Every 30–50 s of good trawling a **box of fish** appears on the aft deck. The status line says why not if you're too slow, too fast or outside a ground.
4. **Mind the shallows:** trawling where it's under 7 m deep fouls the net on the bottom. It holds her back hard and catches nothing until you haul it.
5. **Haul the net** (TRAWL switch off, or hold HAUL on the A-frame) and **carry the boxes ashore** to any port's goods stack to land them. If the deck's full, the catch waits in the net.

**Debug → Missions → Side jobs → Fishing ground** takes you to the nearest ground.

### Wildlife

Gulls wheel over the boat by day, gliding and now and then flapping, and calling. Under way in open, deep water, a pod of dolphins sometimes comes up from astern and rides off the bow for a minute or so, each one blowing as it surfaces. They're decoration: worked out from the time and the boat's position, so the whole crew sees the same animals.

## Off the boat, and cargo by hand

- **Walking ashore:** jump (A / Space) from the deck onto a quay or pier when you're alongside, and back aboard the same way. You keep the boat's own speed when you jump, so jumping off a moving boat is a bad idea. Quays you hit just below the top you clamber onto. Beaches you can wade out from.
- **Swimming:** land in the sea and you float with your head just above the water. Swim with grab-the-world strokes or the stick. Climb out by gripping the gunwale or the transom, or press A beside a quay. The workboat has a **swim ladder** over the starboard side of the aft deck: grip any rung from the water (or press A / Space near it) and you're up it.
- **Cargo:** each port has goods waiting in a row on its quay or beach, coloured by destination. They're man-portable (30–110 kg). Carry one to the boat, set it on the deck, and at its destination set it down ashore near that port's goods stack to deliver it. Dropped in the sea, it's lost.
- **Lashing:** loose cargo slides when the deck heels or accelerates past friction (μ ≈ 0.35, so from about 19° of heel, sooner in a seaway) and goes over the rail if pressed against it hard enough (about 33°). Strap it to a D-ring (the rings along the bulwarks and centreline) and it stays put. Cargo is real weight in her stability: stow it all to one side and she lists.
- **Selkie Bay** has no quay: anchor in the bay, launch the skiff, load her (two crates or one drum), run her up the beach and carry the goods up to the stack. Survivors can only be landed at a quay.

## The archipelago

A new game starts in **Calder Haven**: your boat lies moored alongside the quay in the sheltered harbour, and you stand on the quay beside her. Walk aboard, power her up and start her; the harbour master talks you through your first voyage. The other ports are a few minutes away. Bearings and ranges are on the menu's Voyage tab.

| Port | Type | What's there |
|---|---|---|
| **Calder Haven**, Calder Holm (SE, ~0.5 nm) | Sheltered harbour | A narrow entrance between breakwaters (Fl R 4 s to port, Fl G 4 s to starboard, entering), a calm dredged basin (4.5 m), a fendered quay with a **fuel berth** at its north end |
| **Brannock Pier** (WSW, ~0.4 nm) | Big pier | A 130 m pier into deep water with a T-head berth, **fuel** on the T-head, and a red pier-head light |
| **Selkie Bay**, Rona (S, ~0.6 nm) | Anchorage only | A horseshoe bay about 9 m deep with a beach at its head, sheltered from most of the swell |

Also look out for **Gull Rocks** (on the direct line to Calder Haven), **Tarran** with its lighthouse (Fl W 10 s), Skerry and Eilean Dubh.

### Cargo

Each port has three items waiting ashore, each bound for another port. The box colour shows the destination: **blue** Calder Haven, **orange** Brannock Pier, **green** Selkie Bay.

1. **Go to a port's cargo berth:**
   - **Calder Haven:** the middle/south of the quay. Fuel is at its north end.
   - **Brannock Pier:** the south-east end of the T-head. Fuel is at the north-west end.
   - **Selkie Bay:** anchor in the bay, since there's no quay; the goods come off the beach.
2. **Stop**, open the menu's **Cargo** tab and **Load** what you want. There are four deck slots and a 5 t payload limit.
3. **Take it to its destination** and **Unload** it there. That's a delivery. A replacement cargo then appears at one of the ports.

Cargo is real weight. A full load sits her about 10–15 cm deeper and down by the stern, and she'll feel heavier.

### Docking

You can dock along any quay or pier face with deep water alongside. The named berths are marked with a **yellow strip** on the edge:

- **Calder Haven quay:** a fuel berth and a cargo berth.
- **Brannock T-head:** a fuel berth and a cargo berth.

To dock:

1. Come slowly alongside: within about 18 m, under 3 kn, roughly parallel to the quay (bow either way).
2. The blue **DOCK** button lights. Press it, or use the menu's Boat tab.
3. Bow and stern lines go ashore and warp her in over a few seconds. She's then held alongside but still moves with the swell.
4. **Cast off** with the same button. A hard pull with the engine parts the lines.

**Night:** the ports have lamp posts. Near a port, its floodlight lights the quay, your boat and the water around you.

- **Collisions:** you can run aground and hit quays. Fenders are soft; rock isn't.
- **Refuelling:** come alongside a fuel berth and stop, then use **Refuel** on the menu's Boat tab.

On desktop, aim the **+** reticle at a control. Click buttons and switches. Click and drag the lever (mouse up/down) and the wheel (mouse left/right).

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

`hulls.html` (live at [tartanski-cpu.github.io/SWVR/hulls.html](https://tartanski-cpu.github.io/SWVR/hulls.html)) shows ten workboat hull types, from a 10 m gillnetter to a 26 m multicat, generated from design curves, with their hydrostatics. It is groundwork for modular boats and not part of the game yet.

## Multiplayer

Co-op crew on one boat, peer-to-peer (one player hosts). Menu → **Crew** → **Host a game** shows a 5-digit code; the others type it on the keypad and press **Join**. Everyone sees each other's head and hands and can use every control. Details and limits: [`docs/MULTIPLAYER.md`](docs/MULTIPLAYER.md).

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
