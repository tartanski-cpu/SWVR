# Feature ideas

The owner's feature ideas, in roughly the order they came up, with their status. Technical detail for the work done is in [`PROGRESS.md`](PROGRESS.md).

**Status:** **Done** · **Partly** (a first version exists) · **Open** (not started) · **On hold** (parked on purpose)

## Core vision

| Idea | Status | Notes |
|---|---|---|
| A VR sea rescue and operations game in the spirit of a career mode: chunky low-poly boats operated from the inside with physical controls | **Partly** | The boat, bridge, sea, islands and cargo are in. Rescue missions and the career loop are on hold. |
| Missions and game loop (rescues, jobs, progression) | **On hold** | Parked until asked for. |
| Multiplayer | **Partly** | Version 1 on the `multiplayer` branch: peer-to-peer, one player hosts, crew join with a code, shared boat, avatars. Control ownership and name tags done. Not wanted for now: several boats, voice. See `docs/MULTIPLAYER.md`. |

## Boat and engine

| Idea | Status | Notes |
|---|---|---|
| Displacement workboat with wheel steering | **Done** | 12 m hard-chine hull, hydraulic wheel. |
| Single slow-revving inboard diesel with a big prop: torquey for manoeuvring and, eventually, towing | **Done** | 200 kW, 600–1800 rpm, 3:1 gearbox, 1.05 m prop. |
| Towing | **Open** | The engine and prop were sized for it. It needs a tow line and a vessel or object to tow. |
| Stronger rudder, especially with the engine pushing | **Done** | Bigger slipstream effect on the rudder. |
| Prop walk | **Done** | Right-handed prop, strongest going astern. |
| More roll damping | **Done** | About 15 % of critical. |
| Fuel consumption and oil temperature, so there's refuelling and engine management | **Done** | Fuel burn, coolant and oil temperature, alarms, derate and shutdown, engine-monitor screen, refuelling at fuel berths, pump-failure fault. |
| Exhaust smoke driven by load and engine temperature | **Done** | Darker under load, black puffs, white when cold. |
| Low exhaust at the stern so you see it when backing up; no water spray, dirtier smoke | **Done** | Transom outlet, grey-brown diesel smoke. |
| Cabin light | **Done** | Console switch, ceiling lamp. |
| Controllable searchlight, controls on the bridge | **Done** | SPOT switch and a joystick to port of the wheel; lights the water, quays and islands. |
| Cargo: pick up at one port, deliver to another | **Partly** | Carried by hand to and from the boat, delivered by setting it down at the destination, real weight in her stability. Not yet: pay or economy. |
| Jump off the boat, walk ashore, swim | **Done** | Jump (A / Space) onto quays and back aboard, into the sea; swim, climb out at the gunwale, transom or a quay. |
| Grab cargo crates and tie them down | **Done** | Hand-carried crates, sacks, bottles and drums; loose cargo slides on deck and can go over the side; lash to D-rings. |
| Deck crane or davit | **Open** | To bring back heavy (tonne) cargo that can't be carried by hand. |

## Bridge and controls

| Idea | Status | Notes |
|---|---|---|
| Taller wheelhouse windows for a better view | **Done** | |
| Grab the throttle lever directly with the hand, not with the laser pointer | **Done** | Levers and the wheel follow the hand. The pointer works only on buttons and switches. |
| Throttle closer to the skipper | **Done** | It's on a pedestal starboard of the wheel. |
| A VR menu for configuration and debug controls | **Done** | Wrist menu (Y) with tabs: Sea & time, Boat, Cargo, Comfort, Tests. |
| Desktop controls that work on a German keyboard | **Done** | Keys bound by physical position. The help shows your own key labels. |

## Moving around in VR

| Idea | Status | Notes |
|---|---|---|
| Grab-the-world locomotion as the default | **Done** | Stick walking is optional and can be switched off in the menu. |
| Vertical movement: climb ladders, go up and down stairs | **Done** | Ladder to the wheelhouse roof; floors at several levels. |
| BeamNG-style slider from "head fixed to the boat" to "head compensates for the motion" | **Done** | Motion coupling 0–100 % (menu, or X + stick). The default is rigid, because decoupling made the controls hard to grab. |

## World and sea

| Idea | Status | Notes |
|---|---|---|
| Explorable small archipelago with small ports | **Done** | Nine islands of different sizes. |
| A variety of port types: anchor-only bay, big pier, small entrance into a sheltered harbour | **Done** | Selkie Bay, Brannock Pier and Calder Haven. |
| Wave-height control (slider, or calm / medium / stormy) | **Done** | Presets from Calm to Storm, plus fine ± steps. |
| Wake and splash effects for immersion, frame-rate friendly | **Done** | Wake, slam spray and water sounds. The bow wave was tried and removed. |
| Port lighting for night docking | **Done** | Lamp posts everywhere, plus a real floodlight at the nearest port that also lights the water. |
| Basic docking: press a button in a hot spot | **Done** | Yellow-marked berths; DOCK warps her in and holds her with lines; press again to cast off. |
| Dynamic weather | **Open** | Wind, changing sea state, fog and rain. Wind would also give the anchor something to hold against. |
| Map and charts | **Open** | The world data already holds the coastlines, depths and ports. For now the menu lists bearing and range to each port. |

## Testing and tools

| Idea | Status | Notes |
|---|---|---|
| Keep the sea-trials / inclining test as something to revisit for testing new boats | **Done** | `npm run trials`, the `sea-trials-lab` branch, and `docs/TESTING_NEW_BOATS.md`. |

## Follow-ups noted along the way

These came out of the work above rather than being separate requests:

- ~~**Walking ashore** onto quays and piers.~~ Done.
- **Solid deck cargo,** so you can't walk through it. (Crates now bump each other, but you can still walk through them.)
- ~~**Carrying cargo by hand.**~~ Done.
- **Mooring lines,** once weather or current gives them something to hold against.
- **Breaking waves** on beaches.
- **A moon,** so nights aren't so dark.
