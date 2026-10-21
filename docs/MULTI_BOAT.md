# Multi-boat multiplayer: analysis and plan

The owner's brief (Oct 2026): up to four players (three is the likely case, Quest and desktop mixed), each driving their own boat, joined with the one game code as today. A spawn menu where each player picks a boat: one of the fleet, or a boat of their own from the Shipyard (a saved design, a code, or a file on their disk). Harbours get at least four parking places; the biggest boats spawn anchored in the bay instead; the rest on marked slots along the quay. Anyone can board and drive anyone's boat, so the crew can play as one boat, or as three. Physics and effects get a level of detail by distance: boats near you move in the waves exactly, far ones are simulated cheaply.

This document is the plan. M1 is built (Oct 2026, see PROGRESS "Multi-boat M1"); M2 is next. The owner's answers to the questions at the end are still wanted before M3.

## What the engine does today, and what blocks the brief

Facts from the code (file references for the next session):

1. **Many vessels already.** The world is a list of vessels and the simulation steps them all (the skiff, the tows, traffic ships are kinematic). Views are created for any vessel that appears in a snapshot (`App.syncVesselViews`), including a full interactive boat view with controls for any vessel with a recipe, with its controls routed to that vessel (`boatView.ts`). So "a second boat" is not new; the skiff is one.
2. **One home boat, assumed everywhere.** `testVesselId` (the boat the page was built for) is used about ninety times in `App.ts`: the dash, the engine, horn and alarm sounds, the hand gear and binoculars mounts, the towline and trawl, the bridge wiring (`setupBridge`), the interior detail culling, and every intent the menu sends. The game systems use `homeVessel(world)`: weather region, career, tutorial, duties, rescue, fire, extinguisher, traffic, salvage, potting, rod fishing, forecast, and the host's boarding spot. The controls list of the interaction system is built once at load from the boats present then.
3. **Boat types are static.** `VESSEL_DEFS` has getters only for a fixed list of ids; the Shipyard's `'design'` type is one global slot (`setDesignBoat`); fleet boats are built once at load. A second custom boat has nowhere to live, and the welcome carries only one design token (`world.build.design`). A crew-mate in a different boat from the host reloads the whole page to build hers.
4. **Spawning.** The start boat is placed at one berth (`CONFIG.start.berthId`); berths are named points on a quay face (no length, no occupancy); the mooring finds the nearest berth without asking whether it is taken. Anchorages are circles per port.
5. **Cost.** Physics: every vessel is stepped in full every tick (17 stations × 3 wave samples for the workboat, plus contacts); no level of detail, no sleeping. Effects (wake, spray, smoke, lines) already exist per vessel. A full boat costs 60 to 120 draw calls aboard, a tow one. Snapshots are the whole world as JSON at 20 Hz, about 2.6 KB today, chunked above 15 KB: four full boats would roughly quadruple it.

## Design decisions (proposed)

- **"Your boat" is the boat you are aboard.** Everything about *you* (dash in view, engine sound, hand gear, the menu's boat tab, duties) follows `aboardVesselId`; everything about *a boat* (her career jobs, her tow, her fire) is per vessel. The host's career stays the game's career: one pot, every boat's earnings go into it (co-op). Each player's boat choice is remembered on their device.
- **Every boat carries her build token.** `VesselState.build` = a fleet id, or a design token (her short code, or the whole document packed in a `doc.` token, so a boat from a file on disk travels too). Any page builds her type on demand from the token (a registry of vessel types keyed `boat:<token>`), host and crew alike. No more page reloads to match the host, no more one-slot `'design'`.
- **Spawn slots are region data.** Each default harbour gets four marked parking slots along its quays (`slots` in `RegionDef`, drawn as painted bollard pairs or a sign), and a big-boat anchorage. The host assigns slots; occupancy is in the world state. "Big" is a hull length over `CONFIG.spawn.anchorOverM` (proposed 12.5 m: the pilot boat and the tug anchor off, the landing craft and the gillnetter berth); the owner to confirm, since they have an idea for the biggest boats.
- **The launch menu is the Crew tab.** "Your boat": the fleet, your saved Shipyard boats, a code to paste, a file to open; **Launch** asks the host for a slot and your boat appears there, moored; **Hand her back** removes her. Joining puts you ashore at the harbour (or aboard the host's boat, as now) until you launch.
- **Level of detail by distance to the nearest player.** Physics: full stations within `near` (150 m), every second station to `mid` (600 m), a four-station float beyond, and far boats stepped every other tick. Effects: wake and spray off beyond `mid`, smoke beyond `near`. Views: interior detail and small moving parts hidden beyond `mid` (the culling that exists for the home boat, applied to all), one merged static mesh beyond `far`. Snapshots: a far boat's state sent less often.

## Milestones

Each lands on `/next/` for the owner to try, with tests, in this order. Rough size in sessions of work.

### M1: boats by token (foundation; 1 to 2 sessions) — done
- `VesselState.build` token on every player boat; a runtime registry of vessel types built from a token (`boat:<token>`), used by host and crew; `HULLS`, `RECIPES` and the sim cache keyed by it.
- The welcome and snapshots carry the tokens; a crew-mate builds the host's boat in memory, no reload. The page's `?boat=` / `?design=` restart stays for solo only.
- Test: join a host who is in a Shipyard boat from a file, without a reload; two different custom boats in one world in a test.
- **As built:** `boats/library.ts` `boatType(token)` makes a vessel type `boat:<hash of the token>` (the same id on every page), her token on `VesselState.build`, `ensureBoatTypes(world)` builds any boat a welcome or snapshot brings; the game's `?design=` starts in such a type (the Shipyard page keeps its own 'design' slot). The crew's page still reloads to become the host's boat when hers is another type: the home-boat wiring in App.ts (M2) is what needs it, not the type any more.

### M2: your boat is the one you're aboard (2 sessions)
- `myVesselId` (aboard) replaces `testVesselId` through `App.ts`; the dash, sounds, gear mounts, binoculars, towline, bridge wiring and interior culling move with you when you board another boat. The interaction system takes a boat's controls as her view is created.
- Game systems that need "the boat" take the player's boat (duties, rod, potting, extinguisher) or the vessel in question (rescue, tow, fire, salvage, career jobs per vessel; one shared career pot).
- Debug: "Spawn a second boat" to test with, before the menu exists.
- Test: walk from your boat to the host's, take the wheel, drive; the dash and sounds are hers.

### M3: slots and the launch menu (2 sessions)
- Region data: four slots per default harbour (Calder Haven first, then Loch Tarsk, Kvassvik, Ashby; Oban later) and the big-boat anchorage; drawn slot marks; occupancy in the world; `CONFIG.spawn`.
- Crew tab "Your boat": fleet, saved designs, code, file; Launch and Hand her back; the host places her moored in a free slot or anchored in the bay; the lookout and the chart name crews' boats.
- Test: three players each launch a boat at Calder, one big one anchors off; a fourth finds the last slot; leaving frees it.

### M4: level of detail (1 to 2 sessions)
- Physics station LOD and tick decimation by distance to the nearest player (with the owner's rule: near boats move exactly in the waves); effects and view culling by distance; snapshot thinning for far boats.
- Measure: tick time and draw calls with four boats alongside at Calder and spread over the sound, headless; a frame-time check on the Quest by the owner.

### M5: gameplay and polish (1 session, then as found)
- Several boats on one job (a rescue with two boats, a tow with an escort, pots in company), the VHF and name tags between boats, the duty board per boat, each player's boat choice remembered, docs and README.

## Open questions for the owner

1. **Big boats:** anchor off above 12.5 m hull length (the pilot boat and the tug), or only the very largest? Which idea do you have for them?
2. **A boat left behind:** when her player leaves the game, does she stay moored where she is until the game ends, or vanish?
3. **The career:** one shared pot (the host's career) for the whole crew, or each player earns into their own career? The plan assumes one pot.
4. **Where a game starts:** at the host's harbour (wherever the host is), with the slots there; a joiner who launches far from the host is sent to the host's harbour.
