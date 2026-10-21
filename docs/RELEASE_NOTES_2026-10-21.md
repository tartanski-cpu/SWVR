# Workboat World: what's changed since this morning

**Covers:** Wednesday 21 October 2026, from the early hours to the evening, every session's work.

**What's where:** at 11:43 everything built up to then went to the live game at https://tartanski-cpu.github.io/SWVR/ (the first section below). Everything after that is on the test build, https://tartanski-cpu.github.io/SWVR/next/ (its menu says NEXT), waiting for your OK. Both addresses share one browser storage, so your careers and settings are the same on both.

## In the live game (the morning, before 11:43)

- **Towns and woods on the coast maps:** houses by type from the map data with windows lit at dusk; trees planted from the map's woods, in distance bands with a canopy on the far hills.
- **The chartplotter's sharp coast on the career map too**, cut from the ground itself as on the coast maps; Voyage mode starts in the pilot boat.
- **AI traffic on the Voyage maps:** in a bay or a loch the ships take the longest clear run of water near you, keep to their own depth (coaster 8 m, fishing boat 4 m, yacht 3 m), and alter course when it shoals.
- **Voyage starts you on the quay beside the map's berth**, and remembers where you are on each map between sessions (`&start` on the address begins at the harbour again).
- **The fleet's pilot boat is your "Pilot boat 11.2 m" file.** Strake and fenders kept; her raised foredeck and fore cabin left off, since the pilot boat hull type has no raised foredeck.
- **Shipyard:** the builder split by part; more front windows on a wide wheelhouse; sheer on every hull; a raised foredeck on the fishing boat with a steep ladder each side of the break; a cabin below under the raised foredeck; the deckhouse out to her sides with a raised deck you walk; the gillnetter's wheelhouse forward by default; the Paint step's wheelhouse colour and white or black window frames; ceiling beams painted into the liner; furniture (P5).
- **Release notes since v1.0** brought up to date, by theme (`docs/RELEASE_NOTES_next.md`).

## On the test build only (since 11:43)

### Multi-boat multiplayer (Voyage mode only, for now)

Your answers recorded in `docs/MULTI_BOAT.md`: the biggest boats anchor, worked out from each quay face's length; a boat goes with her player when they leave; no pot, since Voyage has no career. Four milestones built today:

- **M1, boats by token.** A Shipyard boat is a vessel type of her own, named from her design token, the same on every page. Her token rides in every snapshot, so any page builds her from it. Any number of custom boats can be in one world.
- **M2, your boat is the one you're aboard.** Step onto another boat with a wheelhouse and she becomes yours: her controls, dash, engine sound, hand gear, binoculars, towline lead, chart, duty board and chart table. The boat you left keeps her own controls. **Debug → Boat → Second boat** puts a fleet boat alongside to try it, each extra one at a clear spot.
- **M3, berth slots and the launch menu.** **Crew → Your boat → Launch** one of the fleet, a Shipyard favourite or a pasted code; the host finds her a berth whose quay face has room for her length, with water under her whole hull, no block beneath her and no other boat along that stretch; none free and she lies at anchor off the harbour. You are put aboard her. **Hand her back** removes her; leaving the game takes her with you. Oban's quays take about eighteen tugs.
- **M4, level of detail by distance.** The other players' boats are simulated by their distance to the nearest player: within 150 m exactly as now; within 600 m on every second station; beyond, on four stations and every other tick when nothing holds them. Wake and spray are drawn within 600 m, smoke within 150 m, and beyond 1.5 km a boat's controls, labels and screens are not drawn. Four boats cost 1.7 ms a tick spread out instead of 4.5 alongside. The game's own boat, the tows and the skiff are simulated exactly as before.

### Fixes you asked for

- **Bollards stand where the mooring lines tie**, on every quay face with a berth (the lines went to each berth's tie points; the bollards were on their own 12 m grid).
- **The yard sells fenders (£600) and a life ring (£400)** for the beginner boat. The ring brings the rescue calls; the fenders let the roving fender work.
- **The desktop fly camera no longer sinks over the water:** the rig settled onto the floor under the camera, which over the harbour was the seabed; it now holds its height while flying.

### Shipyard (other sessions)

- **Furniture is a step of its own**, up to four of each piece (one head), each with Move and Take off; placed from above with the roof cut away.
- **A section tool:** cut her at a waterline, buttock or station, slid anywhere along her, flipped, to look at the cut. The Furniture step uses it, cut just over the floor.
- **The layout, steps 1 to 3:** her key figures against the brief under the steps, a view-size switch (Design, Balanced, Big view), the right column regrouped into folding groups.
- **Dynamic console sockets, CS1 and CS2:** the dash as a grid of quarter cells with screens placed by rules; the switch panel as a row of switch cells, groups packed from the ends and clear of the wheel. Screens in three sizes (full, strip, quarter): an ANCHOR quarter screen beside the speed screen, the TOW LINE a strip, half-height screens stacked two high. Placing them by hand (CS3) is next.

### Coast maps (other sessions)

- **Harbour boats** on the coast maps: moored, alongside and at anchor, bobbing and swinging to the wind, the number shown near you capped. They make way for players' launched boats, and a launch anchors clear of them.
- **Coast extras C1 to C3:** a features stage reads the rest of the map data and reports piers drawn over each other; fish farms and the skyline from the map; what the shore is made of (sand, shingle, rock, cliff), and bow-ramp boats beach on sand.
- **Trees to suit the device:** far trees on a desktop, the Quest's reach unchanged; Settings → Game → Trees to override.
- **Voyage berths** have room for a whole boat, not her bow on the rocks; you stand on the highest deck where quay blocks overlap (Rothesay's start spot).

### Health (other session)

- **Hurt by cold water, propellers, falls, fire and smoke;** a berth heals; with everyone in a berth you sleep and the hours pass.

## Known limits

- Multi-boat is Voyage-only. The game systems that mean "the boat" (duties, rescue, fire and tow calls, traffic, the forecast) still mean the host's start boat, and a crew-mate joining a host in a different boat still gets one restart. Both are milestone 5's.
- A merged far mesh for very distant boats and thinner snapshots are not done; the Quest frame-time check with four boats is yours.
- Not yet tried on the Quest: all of today's work. The headless checks and the tests are listed per change in `PROGRESS.md`.

## Next

- Milestone 5: the lookout and chart naming the crew's boats, the systems per boat, where a joiner starts.
- Console sockets CS3 (placing screens and switches by hand) and the Shipyard layout steps 4 to 8, in their own sessions.
