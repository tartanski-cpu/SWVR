# Bus keys

Every value on a boat's bus (modular boats; `src/modular/busKeys.ts`). Generated from the registry by `src/modular/keyTable.ts` and checked by a test: edit the registry, not this file.

- **Values:** what it holds (a number's unit and range, on / off, or its names).
- **Use:** a player (or a control) sets it; or it is read only, worked out by the boat; a press does something once. "Held" keys belong to the first hand on them (multiplayer). Only "saved" keys are kept between sessions.
- **Written by:** `module` (a module's port), `core` (the game itself), `legacy` (code not yet a module).
- **Old names:** older intent names that still reach it.

## throttle

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `throttle.demand` | -1..1 | player sets; held: lever | module | `lever` | Throttle / gear lever: -1 full astern, 0 neutral, +1 full ahead. On an outboard boat, the twist-grip throttle 0..1 in the selected gear. |

## helm

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `helm.demand` | -1..1 | player sets; held: helm | legacy | `helm` | Wheel (or tiller) position: -1 hard to port, +1 hard to starboard. |

## ignition

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `ignition.key` | on / off | player sets | legacy | `key` | Ignition key on / off. Off closes the fuel solenoid: a running diesel stops. |
| `ignition.heat` | on / off | player sets | legacy | `heat` | HEAT button held: extra glow-plug heat (key on). The boats have no HEAT button now: the plugs preheat on their own with the key. |
| `ignition.start` | on / off | player sets | legacy | `start` | START button held: the starter cranks (key on, lever in neutral). |

## outboard

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `outboard.on` | on / off | player sets | legacy | `obOn` | The outboard's on/off button: motor on. |
| `outboard.gear` | gear, -1 to 1, whole | player sets | legacy | `obGear` | The outboard's gear lever: -1 reverse, 0 neutral, +1 forward. |
| `outboard.battery` | 0..1 | read only | module |  | The outboard's battery charge. |

## lights

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `lights.nav` | on / off | player sets | legacy | `navLights` | NAV LIGHTS switch. |
| `lights.cabin` | position, 0 to 2, whole | player sets | legacy | `cabinLight` | Cabin light switch: 0 off, 1 white, 2 red (night). |
| `lights.deckFore` | on / off | player sets | legacy | `deckFore` | Foredeck floodlight switch (overhead panel). |
| `lights.deckAft` | on / off | player sets | legacy | `deckAft` | Aft deck floodlight switch (overhead panel). |
| `lights.rail` | on / off | player sets | legacy | `railLights` | Rail LED strips switch (overhead panel). |

## horn

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `horn.sound` | on / off | player sets | legacy | `horn` | Horn button held. |

## wipers

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `wipers.on` | on / off | player sets | legacy | `wipers` | WIPERS switch. |

## searchlight

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `searchlight.on` | on / off | player sets | legacy | `spotlight` | SPOT switch: the searchlight on. |
| `searchlight.pan` | deg, -170 to 170 | player sets; held: spotPan | legacy | `spotPan` | Searchlight pan, + to starboard. |
| `searchlight.tilt` | deg, -35 to 12 | player sets; held: spotPan | legacy | `spotTilt` | Searchlight tilt, + up, 0 horizontal. |

## fm

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `fm.on` | on / off | player sets | legacy | `fmOn` | FM radio power. |
| `fm.station` | index, 0 to 5, whole | player sets | legacy | `fmStation` | FM station, an index into CONFIG.fmRadio.stations. |
| `fm.tune` | on / off | press | legacy | `fmTune` | TUNE pressed: on to the next station, switching the set on if it was off. |

## whiteboard

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `whiteboard.down` | on / off | player sets | module |  | The pull-down whiteboard pulled down (it rolls up into its box under the roof when not). |

## electrical

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `electrical.master` | on / off | player sets | legacy | `master` | Battery master switch (the red key on the aft wall). |
| `electrical.selector` | position, 1 to 3, whole | player sets | legacy | `batSelect` | Battery selector: 1, 2, or 3 = both in parallel. |
| `electrical.powered` | on / off | read only | core |  | 12 V on the bus: master on and the selected battery not flat (boats without electrics: always). |
| `electrical.busVoltage` | V | read only | core |  | Bus voltage on the last tick (0 with the master off). |
| `electrical.amps` | A | read only | core |  | Net battery current on the last tick, + discharging. |

## breaker

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `breaker.instruments` | on / off | player sets | legacy | `brk_instruments` | The instruments breaker on the panel by the helm (on / off). |
| `breaker.chart` | on / off | player sets | legacy | `brk_chart` | The chart breaker on the panel by the helm (on / off). |
| `breaker.radio` | on / off | player sets | legacy | `brk_radio` | The radio breaker on the panel by the helm (on / off). |
| `breaker.navLights` | on / off | player sets | legacy | `brk_navLights` | The navLights breaker on the panel by the helm (on / off). |
| `breaker.deckLights` | on / off | player sets | legacy | `brk_deckLights` | The deckLights breaker on the panel by the helm (on / off). |
| `breaker.bilge` | on / off | player sets | legacy | `brk_bilge` | The bilge breaker on the panel by the helm (on / off). |
| `breaker.hydraulics` | on / off | player sets | legacy | `brk_hydraulics` | The hydraulics breaker on the panel by the helm (on / off). |

## circuit

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `circuit.instruments.live` | on / off | read only | core |  | 12 V on the instruments circuit: master on, battery not flat, breaker on. |
| `circuit.chart.live` | on / off | read only | core |  | 12 V on the chart circuit: master on, battery not flat, breaker on. |
| `circuit.radio.live` | on / off | read only | core |  | 12 V on the radio circuit: master on, battery not flat, breaker on. |
| `circuit.navLights.live` | on / off | read only | core |  | 12 V on the navLights circuit: master on, battery not flat, breaker on. |
| `circuit.deckLights.live` | on / off | read only | core |  | 12 V on the deckLights circuit: master on, battery not flat, breaker on. |
| `circuit.bilge.live` | on / off | read only | core |  | 12 V on the bilge circuit: master on, battery not flat, breaker on. |
| `circuit.hydraulics.live` | on / off | read only | core |  | 12 V on the hydraulics circuit: master on, battery not flat, breaker on. |

## battery

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `battery.1.soc` | 0..1 | read only | core |  | Battery 1 state of charge. |
| `battery.2.soc` | 0..1 | read only | core |  | Battery 2 state of charge. |

## hydraulics

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `hydraulics.on` | on / off | read only | legacy |  | Deck hydraulic pressure: engine running and the DECK HYD breaker on. |

## propulsion

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `propulsion.state` | off / cranking / running | read only | module | `engine.phase` | The engine: off, cranking or running. |
| `propulsion.rpm` | rpm | read only | module | `engine.rpm` | Engine (crankshaft) speed. |
| `propulsion.load` | 0..1 | read only | module | `engine.rack` | Fuel rack position as set by the governor: the engine load. |
| `propulsion.gear` | gear, -1 to 1, whole | read only | module | `engine.gear` | Gearbox engaged: -1 astern, 0 neutral, +1 ahead. |
| `propulsion.thrust` | N | read only | module |  | Propeller (or outboard) thrust on the last tick. |
| `propulsion.immersion` | 0..1 | read only | module |  | How much of the propeller disc is under water (the rudder in its slipstream works as much). |
| `propulsion.crankS` | s | read only | module | `engine.crankS` | Seconds cranked so far this start. |
| `propulsion.glowS` | s | read only | module | `engine.glowS` | Glow-plug preheat accumulated. |
| `propulsion.coolantC` | °C | read only | module | `engine.coolantC` | Coolant (block) temperature. |
| `propulsion.oilC` | °C | read only | module | `engine.oilC` | Lube oil temperature. |
| `propulsion.coolingFault` | on / off | read only | module | `engine.coolingFault` | Raw-water pump impeller failed (debug fault). |
| `propulsion.oilLevel` | 0..1 | read only | module | `engine.oilLevel` | Lube oil in the sump. |
| `propulsion.sinceOilCheckS` | s | read only | module | `engine.sinceOilCheckS` | Running time since the dipstick was last pulled. |
| `propulsion.oilCheck` | on / off | press | legacy | `dipstick`, `engine.oilCheck` | The dipstick pulled: the oil is checked, and the clock to the next check starts again. |
| `propulsion.oilTopUp` | on / off | press | legacy | `oilTopUp`, `engine.oilTopUp` | The oil can used: the sump topped up. |
| `propulsion.wear` | 0..1 | read only; saved | module | `engine.wear` | Engine wear from running hot or dry; costs power. |

## fuel

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `fuel.litres` | L | read only | module |  | Fuel in the tank (the engine draws from it; a fuel berth fills it). |
| `fuel.flowLph` | L/h | read only | module |  | Fuel flow now. |
| `fuel.refuelling` | on / off | read only | legacy |  | Taking fuel at a fuel berth. |

## rudder

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `rudder.angle` | deg | read only | module |  | Actual rudder angle (on an outboard boat, the motor swing), + trailing edge to starboard. |

## anchor

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `anchor.letGo` | on / off | player sets | legacy | `anchor` | ANCHOR switch: let go / pay out (on), heave in and stow (off). |
| `anchor.phase` | stowed / paying / set / weighing / hanging | read only | module |  | Anchor: stowed, paying out, set, weighing, or hanging off the bottom. |
| `anchor.chainOut` | m | read only | module |  | Chain paid out. |
| `anchor.tension` | N | read only | module |  | Horizontal chain tension at the bow on the last tick. |
| `anchor.dragging` | on / off | read only | module |  | The anchor is dragging (tension over its holding power). |

## helmAssist

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `helmAssist.autoStart` | on / off | press | legacy |  | AUTO START pressed: the whole start-up, master and main breakers on and the engine started. |
| `helmAssist.dock` | on / off | press | legacy |  | DOCK pressed: both lines ashore at the berth in range, or cast off (the menu Dock). |

## autopilot

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `autopilot.engage` | on / off | press | legacy |  | AUTOPILOT pressed: hold the heading she is on now, or let go. Turning the wheel lets go too. |
| `autopilot.on` | on / off | read only | legacy |  | The autopilot is holding her heading. |
| `autopilot.heading` | deg | read only | legacy |  | The heading the autopilot holds. |

## joystick

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `joystick.x` | -1..1 | player sets; held: joyX | legacy |  | Helm joystick sideways: -1 full to port, +1 full to starboard (0 let go). |
| `joystick.y` | -1..1 | player sets; held: joyX | legacy |  | Helm joystick fore and aft: +1 full ahead, -1 full astern (0 let go). |
| `joystick.twist` | -1..1 | player sets; held: joyX | legacy |  | Helm joystick twisted: +1 full clockwise (bow to starboard), -1 anticlockwise (0 let go). |

## pods

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `pods.joystickMode` | on / off | press | legacy |  | JOYSTICK pressed: hand the pods to the helm joystick, or back to the wheel and throttle. Only with the throttle in neutral; moving it out of neutral hands them back. |
| `pods.joystick` | on / off | read only | legacy |  | The pods are on the helm joystick (vector mode). |
| `pods.angle.port` | deg | read only | module |  | The port pod's heading, + its push turned to port (as the rudder angle). |
| `pods.angle.stbd` | deg | read only | module |  | The starboard pod's heading. |

## mooring

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `mooring.phase` | free / docking / moored | read only | legacy |  | Mooring: free, docking (lines going ashore) or moored. |
| `mooring.bow` | side, -1 to 1, whole | read only | legacy |  | Bow line: 0 not fast, else the side of the cleat it is on (-1 port, +1 starboard). |
| `mooring.stern` | side, -1 to 1, whole | read only | legacy |  | Stern line: 0 not fast, else the side of the cleat it is on. |

## fenders

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `fenders.out` | on / off | player sets | legacy | `fenders` | Fenders over the side (on) or stowed. |

## winch

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `winch.heaveIn` | on / off | player sets | legacy | `winchHeave` | Tow winch HEAVE IN button held. |
| `winch.payOut` | on / off | player sets | legacy | `winchPayOut` | Tow winch PAY OUT button held. |

## crane

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `crane.slew` | deg, -170 to 170 | player sets; held: crane | module |  | Deck crane: the slew its left joystick asks for, + to starboard of straight ahead (the crane follows at its own rate). |
| `crane.luff` | deg, -5 to 70 | player sets; held: crane | module |  | Deck crane: the boom angle its left joystick asks for, above level. |
| `crane.extend` | m, 0 to 2 | player sets; held: crane | module |  | Deck crane: how far its right joystick asks the telescopic boom to be run out (the crane follows at its own rate). |
| `crane.wire` | m, 0.4 to 6 | player sets; held: crane | module |  | Deck crane: how much wire its right joystick asks to be paid out from the boom tip (more: the hook lower). |
| `crane.hook` | on / off | player sets | module |  | Deck crane HOOK button held: a press takes the item under the hook, or sets down the one on it. |

## trawl

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `trawl.shoot` | on / off | player sets; also set by fishing | legacy | `trawl` | TRAWL switch: shoot the net (on) / haul it (off). It follows the net when worked by hand. |
| `trawl.warpOut` | 0..1 | read only | legacy |  | How far the trawl's warps are paid out, 0 (in) .. 1 (fishing): what the trawl winches' drums show (fishing.ts). |
| `trawl.netOnDrum` | 0..1 | read only | legacy |  | How much of the trawl net is wound on its drum, 0 .. 1 (all of it, stowed): what the net drum shows (fishing.ts). |

## net

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `net.payOut` | on / off | player sets | legacy | `netOut` | Trawl PAY OUT button on the A-frame, held. |
| `net.haul` | on / off | player sets | legacy | `netIn` | Trawl HAUL button on the A-frame, held. |
| `net.release` | on / off | player sets | legacy | `netRelease` | Trawl RELEASE button on the A-frame's box: the codend, hanging over the deck, emptied (fishing.ts). |

## aFrame

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `aFrame.luff` | 0..1 | read only | legacy |  | How far the A-frame has swung inboard on its rams: 0 raked aft over the stern, 1 in over the deck (fishing/codend.ts). |

## firePump

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `firePump.on` | on / off | player sets | legacy | `firePump` | FIRE PUMP switch. |

## monitor

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `monitor.pan` | deg, -170 to 170 | player sets; held: monPan | legacy | `monPan` | Fire monitor pan, + to starboard. |
| `monitor.tilt` | deg, -10 to 55 | player sets; held: monPan | legacy | `monTilt` | Fire monitor elevation. |

## tender

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `tender.phase` | free / stowed / lowering / hoisting | read only | legacy |  | A ship's boat: free, stowed in her cradle, lowering or hoisting. |

## door

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `door.aft.open` | on / off | player sets | legacy | `door` | The wheelhouse aft door open (starts open). |
| `door.side.open` | on / off | player sets | legacy | `sideDoor` | The wheelhouse port side door open (starts shut). |

## gate

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `gate.side.open` | on / off | player sets | legacy | `sideGate` | The gate in the working-deck bulwark open (starts shut). |

## ramp

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `ramp.bow.down` | on / off | player sets | legacy | `bowRamp` | The bow ramp lowered (starts raised; the landing craft). |

## hatch

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `hatch.engine.open` | on / off | player sets | legacy | `engineHatch` | The engine hatch in the wheelhouse floor open. |
| `hatch.hold.open` | on / off | player sets | legacy | `holdHatch` | The fish hold's hatch lid open (starts shut; a Shipyard boat's fish hold). |

## furniture

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `furniture.headDoor` | on / off | player sets | legacy | `headDoor` | The head's door open (starts shut; a Shipyard boat's furniture). |

## hold

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `hold.lift` | on / off | player sets | legacy | `holdLift` | The fish hold's LIFT button: a box lifted out onto the deck by the hatch (the lid open; fishing/fishHold.ts). |
| `hold.boxes` | boxes | read only | legacy |  | Fish boxes in the fish hold. |

## chartTable

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `chartTable.leafOpen` | on / off | player sets | legacy | `chartLeaf` | The chart table's drop leaf unfolded (folded: against the wall). |
| `chartTable.lamp` | on / off | player sets | legacy | `chartLamp` | Chart table lamp switch. |

## bilge

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `bilge.level` | 0..1 | read only | module |  | Water in the bilge (a damaged hull leaks in; the bilge pump takes it out). |

## hull

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `hull.damage` | 0..1 | read only; saved | legacy |  | Hull damage; it leaks into the bilge. |

## contact

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `contact.force` | N | read only | core |  | Total contact force against ground or structures on the last tick. |
| `contact.slide` | m/s | read only | core |  | Mean sliding speed of the touching points. |
| `contact.impact` | m/s | read only | core |  | Largest approach speed of a point that touched this tick (less what a fender, strake or tyre took up). |

## lamp

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `lamp.oil` | off / on / blink | read only | legacy |  | OIL lamp: on with no oil pressure (key on, engine stopped), blinking while running with the sump nearly dry. |
| `lamp.charge` | off / on / blink | read only | legacy |  | CHARGE lamp: on while the alternator isn't charging (key on, engine stopped). |
| `lamp.glow` | off / on / blink | read only | legacy |  | GLOW lamp: on from the key going on until the glow plugs are hot enough (wait for it to go out, then START). |
| `lamp.neutral` | off / on / blink | read only | legacy |  | NEUTRAL lamp: on with the lever in neutral; blinking while START is held in gear. |
| `lamp.bilge` | off / on / blink | read only | legacy |  | BILGE lamp: blinking with the bilge over its alarm level. |
| `lamp.hull` | off / on / blink | read only | legacy |  | HULL lamp: on with hull damage worth a repair, blinking when bad. |
| `lamp.engine` | off / on / blink | read only | legacy |  | ENGINE lamp: on with engine wear worth an overhaul, blinking when bad. |
| `lamp.temp` | off / on / blink | read only | legacy |  | TEMP lamp: blinking with the coolant over its alarm temperature. |
| `lamp.fuel` | off / on / blink | read only | legacy |  | FUEL lamp: on with the fuel under its low mark. |

## nav

| Key | Values | Use | Written by | Old names | What it is |
|---|---|---|---|---|---|
| `nav.speedKts` | kn | read only | core |  | Speed over ground. |
| `nav.heading` | deg | read only | core |  | Compass heading of the bow, 0 north, 90 east. |
