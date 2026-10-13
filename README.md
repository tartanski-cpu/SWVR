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
| W A S D | Walk (with collision; Shift = brisk) |
| F | Toggle walk / free-fly camera (Space / C = up / down when flying) |
| Space / C at the ladder | Climb up / down (walk forward off the top onto the roof) |
| Space (elsewhere) | **Jump**: off the boat onto a quay, from a quay aboard, or into the sea. Swimming near the hull or a quay: climb out |
| Click a cargo item | Pick it up (carried in front of you); click again to set it down |
| Q on cargo on deck | Lash it to the nearest D-ring / release it |
| B | Board the boat (you appear at the helm) / back to the platform |
| Aim **+** and click / drag | Operate the bridge controls (see below) |
| E | Debug: engine start / stop |
| ↑ / ↓ | Debug: throttle/gear lever ahead / astern |
| ← / → | Debug: wheel to port / starboard |
| X / G | Debug: lever to neutral / wheel amidships |
| T | Hydrostatics + sea trials report |
| L | Sea state: cycle calm / slight / moderate / rough / storm |
| 9 / 0 | Motion coupling −/+ 10 % |
| R / K | Test: drop the boat from 4 m / heel her 20° and release |
| V | Buoyancy debug view on/off |
| N / M | Time of day −/+ 30 min |
| F3 or I | Debug overlay on/off (FPS, cpu/gpu frame time, draw calls, boat readouts) |
| P | Wave surface probes on/off |
| F1 or H | Help panel on/off |

### VR (Quest 3)

| Input | Action |
|---|---|
| **Grip** with your hand on the throttle lever or wheel | Grab it; it follows your hand (not where the controller points). Two hands work on the wheel |
| **Trigger** touching a button or switch | Press it (start/stop, horn, nav lights) |
| Trigger pointing at a button or switch a little out of reach | Pointer-ray fallback for buttons and switches only (a blue line shows the target) |
| **Grip** on empty air + pull | Move (grab the world). Two grips + twist: turn. In the water these are your swimming strokes |
| **A** | **Jump** (off the boat, onto a quay, into the sea) |
| **Grip** on a cargo item | Pick it up; it follows your hand. Items over 60 kg need both grips on them. Let go to set it down: on the deck over the boat, ashore over land, lost in the sea |
| **Trigger** touching cargo on deck | Lash it to the nearest D-ring (orange straps) / release it |
| **Grip** on the gunwale or transom while swimming | Haul yourself aboard (A near a quay climbs out there) |
| **Grip + pull down at the ladder** | Climb (aft face of the wheelhouse, up to the railed roof). Push up to climb down |
| **Y** | **Menu** on your left wrist (see below) |
| Left stick | Walk (head-relative; can be switched off in the menu) |
| Right stick ← / → | Snap turn (30° by default; 15/30/45/90° in the menu) |
| Left stick click | Board the boat (at the helm) / back to the platform |
| Hold X + left stick ↑ / ↓ | Motion coupling 0–100 % (fine adjust; also in the menu in 10 % steps). Default 100 % = rigid to the deck; lower values make controls harder to grab |
| B | Debug/perf panel on your left wrist: FPS, cpu/gpu frame time, draw calls, XR resolution, boat readouts |

### VR menu (Y)

The menu stands above your left hand. Use the **right** controller on it in one of two ways:

- **Poke:** push the tip of the controller into a button.
- **Point:** aim the ray (an orange line) and pull the trigger.

While your right hand is on the menu, its trigger doesn't reach the bridge controls behind it. If the left controller isn't tracked, the menu floats in front of you instead.

The menu has six tabs along the top:

| Tab | Settings |
|---|---|
| Sea & time | Time of day ±1 h / ±10 min; time flow stopped / ×60 / ×600; sea state Calm / Slight / Moderate / Rough / Storm, with ± for the wave height (Hs 0–3.6 m); bearing and range to each port |
| Boat | Board / leave; fuel and **Refuel** (at a fuel berth); anchor status; sea-trials report on a big panel in front of you (the game freezes for about a second while the trials run) |
| Cargo | Where you are, payload, deliveries; cargo aboard (lashed or loose). At an anchorage, the port's **skiff** brings goods out and takes them ashore |
| Comfort | Motion coupling ±10 %, stick walking on/off, snap-turn angle. Remembered on the device |
| Tests | Drop from 4 m, heel 20°; engine faults (fuel to 5 %, raw-water pump failure); perf panel, buoyancy view, wave probes |

### Bridge

At the helm, from left to right on the console:

- **Nav lights** toggle switch.
- **Anchor** switch: down = let go (the chain pays out to 4 × depth + 5 m), up = heave in and stow.
- **SPOT** switch (far left): the searchlight on the wheelhouse roof.
- **Searchlight joystick:** on the pedestal to port of the wheel, under your left hand. Grip it and push sideways to pan, forward/back to raise/lower the beam. The further you push, the faster it moves; let go and the light stays put. On desktop, click and drag it.
- **Cabin** light switch: the wheelhouse ceiling lamp.
- **DOCK** button (blue, right of the wheel): lights up when you're in a berth's hot spot. Press it to dock; press again to cast off.
- **Horn** button (hold).
- **Wheel**: 1.5 turns lock to lock. Hydraulic steering, so it stays where you leave it.
- **Throttle/gear lever**, on a pedestal starboard of the wheel so it falls to hand: forward = ahead, back = astern, with a notch at neutral.
- **Start/stop** button. The engine only starts with the lever in neutral.

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

## Off the boat, and cargo by hand

- **Walking ashore:** jump (A / Space) from the deck onto a quay or pier when you're alongside, and back aboard the same way. You keep the boat's own speed when you jump, so jumping off a moving boat is a bad idea. Quays you hit just below the top you clamber onto. Beaches you can wade out from.
- **Swimming:** land in the sea and you float with your head just above the water. Swim with grab-the-world strokes or the stick. Climb out by gripping the gunwale or the transom, or press A beside a quay.
- **Cargo:** each port has goods waiting in a row on its quay or beach, coloured by destination. They're man-portable (30–110 kg). Carry one to the boat, set it on the deck, and at its destination set it down ashore near that port's goods stack to deliver it. Dropped in the sea, it's lost.
- **Lashing:** loose cargo slides when the deck heels or accelerates past friction (μ ≈ 0.35, so from about 19° of heel, sooner in a seaway) and goes over the rail if pressed against it hard enough (about 33°). Strap it to a D-ring (the rings along the bulwarks and centreline) and it stays put. Cargo is real weight in her stability: stow it all to one side and she lists.
- **Selkie Bay** has no quay: anchor in the bay and the bothy's skiff brings goods out and takes them ashore (Cargo tab).

## The archipelago

From the start (the pilot-station platform), the ports are a few minutes away. Bearings and ranges are on the menu's Sea & time tab.

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

Dockable berths are marked with a **yellow strip** on the quay or pier edge:

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

## Multiplayer

Co-op crew on one boat, peer-to-peer (one player hosts). Menu → **Crew** → **Host a game** shows a 5-digit code; the others type it on the keypad and press **Join**. Everyone sees each other's head and hands and can use every control. Details and limits: [`docs/MULTIPLAYER.md`](docs/MULTIPLAYER.md).

## Testing a new boat

There's a built-in "sea-trials lab". It covers hydrostatics, the GZ curve, an inclining experiment, free-decay motions, and speed/turning/stopping trials, all computed from the same hull the game floats. See [`docs/TESTING_NEW_BOATS.md`](docs/TESTING_NEW_BOATS.md). A snapshot of the project at that stage lives on the `sea-trials-lab` branch.

## Project layout

```
src/
  config.ts        every tunable number (waves, mass, thrust, drag, comfort, perf)
  app/             top-level wiring: renderer, frame loop, XR session setup, desktop mouse, test scene
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
