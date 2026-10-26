# Progress: The map

The running record for this area's chat: the coast pipeline, coast regions and Voyage maps. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `tools/coast/`, `coast.html`, `public/regions/`, `src/world/regions/`, `src/world/coast*.ts`, `src/world/maps.ts`, `src/world/view/coastView.ts`, `docs/COAST_PIPELINE.md`, `docs/REGIONS.md`; settings in `src/config/map.ts`.
- **Its tests while working:** `npm run test:map`. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/map/ (branch `preview/map`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

### Turku: the finished ship as the dock ship's shape, white and blue; the yard's name on the gantries (27 Oct 2026)

Owner: "the docks [are] usually drained during the build. I don't like the completed cruise ship. You can actually make it look like the same shape as the ones in the dock, but just a nice white paint and a blue coloured hull. And I'd like the text Meyer Turku to be on the gantry cranes."

- **The dock:** drained during the build, as it was drawn; unchanged.
- **The finished ship** (`coastStructures.ts` `yardShipParts`): the dock ship's shape complete (her hull, the decks stacked with the raked front and the terraces aft), painted white over a blue hull (`colours.hull` 0x1f3f8a), red below the waterline, with her window bands, lifeboats, funnel, water-park and bridge (taken off at first by mistake, and put back: owner, "I didn't say I didn't like the glass bands, the lifeboats, funnel, slides and bridge").
- **The yard's name on the gantries:** "MEYER TURKU" in block capitals along both faces of each girder, white on the blue, a little to one side of the middle. The wording comes from the map's request (`turku.yaml` `gantrySign`; `common.ts`, `package.ts`, `GantryDef.sign`), not the code. Letters are drawn as flat strokes on a 4 by 6 grid (`STROKES`: the letters needed so far, A E K M N O R T U Y; anything else is a space), two triangles a stroke, in the one landmark mesh. `CONFIG.structures.gantry.signHeight` 6.5 m, `colours.sign`. Note for later: it's the yard's real name and trademark, written plainly (no logo); worth remembering if the game is ever published commercially.
- **Tests** (`coastTurku.test.ts`): the gantries with their signs still under 2,000 triangles; the ships under 6,000. `npm run test:map` and the typecheck pass. Seen in the game headless: the sign reads along the girder; the finished ship white over blue at the pier.
- **Not checked:** on the Quest.
- **Shared changes:** `src/world/defs.ts` (`GantryDef.sign`).

### Turku: cruise ships building at Perno (26 Oct 2026)

**Owner approved; merged into `next`.**

Owner (who worked at the yard): "I'd like to have some partially completed cruise ships in the yard ... use the images and build up something that looks convincing."

- **Two ships, an original design** (not a real ship or class), placed from the map by the request (`turku.yaml` `yardShips`; `common.ts`, `package.ts`):
  - **In the building dock** (the map's dry dock, 368 by 81 m, read by the features stage as `drydocks`): 330 m, about half built (`stage` 0.45). She stands on her keel blocks on the dock floor (the dock is dry ground in the map): red bottom, the hull a patchwork of primer-grey, light-grey and white blocks (a few already navy), the superstructure lifted on block by block, each to its own height, under the two gantries.
  - **At the outfitting pier** (the yard's berth along the 209 m pier): 300 m, nearly finished (`stage` 0.88), afloat (keel 8.5 m down). Navy hull, white decks each with a thin glass-and-balcony line, the front raked back, the stern terraced, the bridge with its wings, the funnel, a water-park aft (coloured slides, a tower, a dome), the orange lifeboats along her sides, a few blocks still in primer.
  - Two of the yard's yellow luffing cranes along each (portal, slewing house, jib raised over her).
- **Drawing** (`coastStructures.ts` `yardShipParts`): the hull and every deck built as prisms over the hull's plan (a parallel body, a fine bow over its last 22 %, the stern's corners rounded); merged into the region's one landmark mesh, so no extra draw call. Both ships together are about 4,300 triangles.
- **Settings** `CONFIG.structures.yardShip` (hull depth 6.5 % of her length, decks of 3 m, 16 of them, the superstructure from 6 % to 78 % of her length, rake 1.4 m a deck, terraces every 3 decks, blocks 24 m, lifeboats every 15 m, colours); in the pipeline `T.yardBeam` (14 % of her length), `yardDraught`, `yardBerthOff`.
- **Tests** (`coastTurku.test.ts`): the half-built ship in the dock, between the gantry's rails, on its floor; the finished one afloat by the yard's berth; she stands over 60 m above the water, the half-built one lower; under 6,000 triangles together. `npm run test:map` and the typecheck pass. Seen in the game headless from the water and from above (the dock ship under the gantries, the finished one at the pier).
- **Not solid** (like the bridges and the gantries): you can sail through them. Making them solid would need new physics shapes, so it's the owner's call.
- **Not checked:** on the Quest.
- **Shared changes:** `src/world/defs.ts` (`YardShipDef`, `RegionDef.yardShips`).

### Turku and the Archipelago Sea: a new Voyage map, and the Baltic theme (26 Oct 2026)

**Owner approved; merged into `next`.**

Owner, after the "Next Waters" research page: "Go ahead with Turku as the next map".

- **The map:** `tools/coast/requests/turku.yaml`, box [21.78, 60.16, 22.45, 60.50], 36.9 by 37.8 km, chunked like the Clyde (359 chunks, the biggest 10,392 faces, within the 12,000 budget; 28 MB of mesh). Turku and its port, the Meyer Turku yard at Perno, Ruissalo, the Airisto fairway, Naantali, Pargas, Nagu and the islands between. Voyage starts at the Port of Turku's cargo berth (4.2 m of water), in its live weather (read at 60.3 N, 22.1 E). Landing page: a Turku line under Voyage.
- **Data:** the same sources as the other maps (OpenStreetMap, Copernicus GLO-30, ESA WorldCover, EMODnet, which covers the Baltic). No new source was needed. OpenStreetMap here is very full: 2.1 million points, about six times the Clyde's.
- **The Baltic theme** (`tools/coast/src/themes.ts` `BALTIC`): grey-pink granite shores rounded by the ice, reed beds, hay fields; Scots pine on the rock, spruce in the hollows, birch at the edges, juniper scrub, not planted in rows; wooden houses in red ochre and yellow (some white or pale grey) with dark metal or red roofs, red-ochre sheds and boathouses, Turku's blocks rendered cream and grey, three storeys; motor cruisers and yachts at the guest-harbour pontoons, few swinging moorings. Invented Finnish and Swedish ferry names (`FERRY_NAMES.baltic`). Its weather in `world/maps.ts` (`BALTIC_WEATHER`): grey and changeable, overcast spells longest, rain and fog often.
- **Keeping a crowded archipelago the size of the others**, three new request options (`common.ts`), off for the other maps, which re-package unchanged:
  - `privateJetties`: the map marks every summer cottage's jetty as a pier, which gave 471 harbours and 259 ports (the Clyde has 56). A group of piers with no name of its own and no quay wall is now drawn and solid but isn't a port, has no moorings round it, and brings in only the buildings within 80 m (`harbours.ts` `privateReach`). Turku: 48 ports, 8,357 buildings (from 18,152), 338 moorings (from 1,684).
  - `pottingApart` 1200: creel grounds no closer than 1.2 km (1,706 to 215; every charted rock had one).
  - `ferriesNamed`: only named ferry routes, the longest piece of each name (45 to 12): the road ferries (Prostvik to Lillmälö, Haverö, Käldö), the archipelago boats to Seili, Röölä, Vepsä and Naantali, the ring routes round Nagu, and the Finnlines ship from Travemünde up the fairway.
  - For every map: a ferry route more than a fifth over the game's land is left out (Turku's Aura river water bus: rivers are land in the game for now). No other map had one.
- **Names, by hand** (`turku.edits.yaml`): the harbour the map calls "Silja Line: Turku pier" is the Port of Turku (`port-of-turku`, the Voyage start); "Outfitting place 4-5" is Perno shipyard; "D" is Tammisto jetty; "Boatservices, storage" is Västörä boatyard; "Tiilitehtaanranta A" is Tiilitehtaanranta quay.
- **Pipeline speed:** the harbours stage looked up the list of every tagged map point once per point (quadratic). On Turku it took 37 minutes; now 64 seconds, with the same result (Oban checked).
- **Tests:** `tests/coastTurku.test.ts`: the box, the chunks within budget, the Baltic theme; the Port of Turku reads 60.44 N, 22.22 E; the start berth in water; Perno, Pargas, Nagu and Naantali are ports; the private jetties aren't ports but every piece is drawn; 30 to 70 ports, none with a stub name; named ferries only, each once, over water; creel grounds 1.2 km apart. `npm run test:map` (138), the typecheck and all of `npm test` (1,639) pass.
- **Checked in the game** (headless): Turku loads in about 10 s with no errors, moored at the Port of Turku, the GPS reading 60.436 N, 22.218 E; 161 draw calls at the port. Screenshots at the port, off the Perno yard and off Nagu: the wooden houses in their colours, pine and spruce woods to the water, yachts at anchor, a ferry at the terminal.
- **Not checked:** on the Quest (frame rate, memory on a long voyage; Turku's mesh is 28 MB against the Clyde's 25 MB, and it has more buildings); ferry schedules by eye; the chart and the radio's place names in Finnish and Swedish (the map has both; the game shows whichever the map gives).
- **The Perno yard's gantry cranes** (owner, with photos of the yard): the features stage now reads a shipyard's gantry crane track from the map (`man_made=crane`, `crane:type=gantry_crane`, drawn as an area: its long side is the way it runs, across it the span; `count` gantries; `gantryMinSpan` 40 m). Perno's: 743 m along the building dock, 156 m between the rails, two gantries. Each is drawn (`coastStructures.ts` `gantryParts`) as an A-frame of two legs on their bogies on each rail, a box girder across, a cab trolley on top, a hoist trolley under it with ropes and a hook block, and a T-crane on top of one leg, dark blue with yellow-orange trolleys; the rails along the whole track. An original low-poly form to the map's track: no names or logos. Merged into the region's one landmark mesh (no extra draw call), under 2,000 triangles a gantry. Settings `CONFIG.structures.gantry` (height 100 m to the girder's top, girder 11 by 9 m, legs 4 m, feet 34 m apart, where each stands along the track, mast 20 m, jib 42 m, hoist 45 m, colours). Not solid, like the bridges.
- **Next, if wanted:** a cruise ship fitting out under the gantries; winter ice; a ferry livery of its own for the Finnish road ferries (they use the plain one for now).
- **Shared changes:** `index.html` (a Turku line on the landing page); `src/world/defs.ts` (`GantryDef`, `RegionDef.gantries`). `src/world/maps.ts` is this area's.

### Career: Brannock Pier the deep-water berth; deep boats start there (25 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "We need a new deep water harbour on the career map. The new tugboat's got about 5.5 metres draft minimum. And we're going to have vessels with up to 10 ... Maybe just make Brannock Pier the deep water one, where by default bigger ships spawn in." Asked: keep the pier as it is (its 50 m T-head), and choose the start by draught.

- **Measured first:** Brannock's T-head already has 35 to 37 m of water alongside (the island's slope), and 35 m along its seaward face; Calder Haven's basin is 4.5 m. So no dredging; nothing in `home.ts` changes.
- **The start by draught** (`world/startSpot.ts` `startBerthFor`): in the career, a boat that can't lie anywhere in Calder Haven with her draught and `CONFIG.spawn.underKeel` (1 m) to spare starts at `CONFIG.start.deepPort` (`brannock`), at the first of its berths with room for her (the same check as a launched boat's berth: her length along the face, water under her whole hull); a ship too long for any of them lies at its cargo berth, overhanging the head, rather than aground in Calder. The player is put ashore beside her berth (on the pier). Every boat in the game today (the deepest, the coaster, 3.4 m) starts at Calder as before; Voyage maps are unchanged.
- **Config key:** `CONFIG.start.deepPort` `'brannock'` (`src/config.ts`).
- **Tests:** `tests/deepStart.test.ts`: every boat today still starts at Calder; the small tug drawn 5.5 m deep starts moored at Brannock's T-head in over 6.5 m of water, the player on the pier beside her; a 58 m ship drawing 10 m lies at Brannock (along its 136 m arm, where she fits) in over 11 m.
- **Not checked:** in the game by eye (no boat that deep exists yet to start in); the first-voyage tutorial from Brannock (it was written for Calder's start: a deep boat's new career may want its own words).
- **Shared changes:** `src/world/startSpot.ts` (`startBerthFor`), `src/core/world.ts` (the start uses it; the player ashore beside her berth), `src/config.ts` (`start.deepPort`): the main game's, small. README: the start and Brannock's depth.

### Review fixes: real latitude and longitude, far hills merged less, passed chunks freed (24 Oct 2026)

**Owner approved; merged into `next`.**

Owner, after the main game chat's review (`docs/REVIEW_2026-10-24.md`): "Do the two map items and the lat/long".

- **Real latitude and longitude on the Voyage maps.** The GPS (NAV display), the paper chart's scale and the radio's positions used the career archipelago's made-up origin on every map, so Syros read as Scotland. Each package now carries its box in degrees (`bbox`, from the request; the four maps re-packaged, nothing else in them changed), and `src/world/coastGeo.ts` inverts the pipeline's projection about the box's middle, both ways (the same sums as the Timber handoff's `metaverse.ts`, which the test checks against). `toLatLon` uses it whenever a coast map is loaded; a new `fromLatLon` does the reverse, and the paper chart draws its scale with it. The career islands keep their made-up origin (`CONFIG.nav`). In the game: Syros's quay reads 37.437° N 24.940° E (Ermoupoli), Rothesay 55.839° N 5.055° W, Oban bay 56.414° N 5.475° W.
- **Far hills merged less** (`coastView.ts`). A big map merged its far chunks into one mesh again, and sent it to the graphics chip, each time a chunk crossed a line or the visibility drifted, up to twice a second. Now: the fog's reach is rounded up to 500 m steps (`coastFogStep`); a chunk keeps its coarse copy 300 m past its line (`coastHysteresis`); the chunks are re-sorted by distance only after 50 m of movement (`coastResort`); a merge only happens when a chunk must join (a hole otherwise), and then it takes in the chunks within 2 km of needing it too (`coastFarAhead`: the next row about to leave the coarse ring, the hills just beyond the fog), so one merge serves a whole row; chunks no longer needed stay in the mesh, under the nearer ground or in the fog, until they're over a quarter of it (`coastFarSlack`, at most every `coastFarTidy` 5 s). On a 30 km run down the Clyde in wandering visibility: 14 merges, down from 166 for the same run merging chunk by chunk.
- **Passed chunks freed.** A chunk's coarse copy and its town's buildings stayed in memory once made, so a long Clyde voyage kept every one it had passed. Now they're freed beyond 1.5 times the distance they're drawn within (`coastDropFactor`; 9 km and 3 km) and made again on coming back. On the same run, at most 56 coarse copies at once.
- **Config keys** (`src/config/map.ts`, `regions`): `coastFogStep` 500, `coastHysteresis` 300, `coastResort` 50, `coastFarAhead` 2000, `coastFarSlack` 0.25, `coastFarTidy` 5, `coastDropFactor` 1.5.
- **Tests:** `tests/coastGeo.test.ts` (every map's weather point both ways; Syros in the Aegean; Oban as the handoff places it; north up, east right), `tests/coastViewBudget.test.ts` (the 30 km Clyde run: merges and meshes kept). `npm run test:map`, the typecheck and all of `npm test` (1484) pass. Headless: Syros, Clyde and Oban start without errors, their positions as above, the Clyde's far hills drawn.
- **Not checked:** frame times on the Quest (the merges were a stutter there, not measurable here); the paper chart's scale by eye.
- **Shared changes:** `src/nav/geo.ts` (`toLatLon` uses the coast map's grid when one is loaded; new `fromLatLon`) and `src/nav/paperChart.ts` (its scale through `fromLatLon`), the main game's. `src/world/coastRegion.ts`'s `CoastPackage` gains `bbox`. README: a line on real positions.

### (From the modular-builder chat) A wind farm in the home region

At the owner's word (24 Oct 2026, crew transfer to wind farms): `src/world/regions/home.ts` has a new `windFarms` list, the Holm Rig wind farm (three turbines south-east of Calder Holm, clear of the Calder Bank fishing ground). The data type is `WindFarmDef` in `src/world/defs.ts`, the collision `src/world/windFarm.ts`, the drawing `src/world/view/windFarmView.ts`. Details in `docs/progress/modules.md`.

### Fix: /next/ failed to build: two long tests out of time on GitHub's machine (24 Oct 2026)

Owner: "The work-in-progress build (branch next) failed its tests or its build this time."

- **What failed** (publishing run 577, the `next` step): two long simulations ran past their time limits on GitHub's runner, which is about twice as slow as this machine. `tests/engine.test.ts`, "engine temperature" (37.6 s against 30 s; 20 s here), and `tests/shipyard/outboards.test.ts`, "outboards: cooling" (past the 20 s default; 12 s here). Nothing in the game was wrong: the same commit passes all its tests and builds here.
- **Fixed:** those two test groups get room, 120 s and 90 s. The project-wide default (`vitest.config.ts`, 20 s) is unchanged. Every other long test checked against GitHub's times: all well within their limits (the trawler's 61 s of 120, the coast traffic's 35 s of 60).
- **Shared changes:** `tests/engine.test.ts` (the main game's) and `tests/shipyard/outboards.test.ts` (the Shipyard's): a time limit each, nothing else. Both chats told.


### Oban: the start (cargo) berth moved to the North Pier's south-west face (23 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "the default spawn at Oban pier is not very good because there's no room for the table or the cargo or even the boat. Could you move it to the ... south-west facing side of the pier?"

- **Why it was cramped:** the package stage picks a harbour's cargo berth by room for a boat, fixed faces first, then nearest the harbour's middle. At Oban that put it in the inside corner of the North Pier's two arms: room for the workboat, but not for a bigger boat, and little deck behind it for the goods.
- **Now** (`tools/coast/requests/oban.yaml`, `berthFacing: { oban: 225 }`; `tools/coast/src/package.ts`): a request can ask for a harbour's cargo berth on a face looking a given way, within `facingTolerance` 30°. The package stage takes the fixed face with the most such berths with room for a whole boat and puts the cargo berth at its middle, for room either side. At Oban that's the North Pier's south-west side, open to the bay: 4 berths in a row, the cargo berth the third, on a stone quay 77 m long and 10 m wide. The fuel berth stays where it was (the arm's north-west corner, 40 m off; the two are kept at least `namedApart` 30 m apart).
- Voyage starts you at the cargo berth, so this is the new start for Oban and Lorn. Its id is the same (`oban-cargo`), so a saved spot there now puts you at the new place. Only Oban's port, berths, lamps and stack light moved in the game's file.
- **More cargo:** the amounts (each port's waiting items, `CONFIG.cargo.perPort` 5; a contract's 2, 4 or 6) are the game's cargo rules, in the main game's settings, so they're handed to the main game chat. The new berth's deck has room for a much longer row of goods.
- **Tests:** all 1,438 pass (the Voyage start tests: you're put ashore on the berth's own deck, the boat made fast).
- **Checked headless:** Voyage → Oban and Lorn with `&start`: the boat moored along the south-west face, you on the quay beside the goods (drums) in front of the warehouses; from above, open water either side of her.
- **Test steps (VR and desktop):** Voyage → Oban and Lorn (a fresh start: add `&start` to the address, or Menu → start again). You're on the North Pier's south-west side, the boat alongside with open water ahead and astern, the goods behind you on the wide quay.


### Landmarks and bridges: Connel Bridge and McCaig's Tower (23 Oct 2026)

**Owner approved; merged into `next` (live there from build `ccf65c7`).**

Owner: "I had the feeling that we missed a pass on the maps, specifically to add landmarks and bridges ... I would have expected a bridge at the Falls of Lora in the Oban map. And there's actually a very famous landmark in Oban, which is like a mini Colosseum."

- **What was missing:** the pipeline read no bridges at all, and its landmarks (castles, towers, masts, chimneys, water towers, monuments, churches, turbines) had no follies. McCaig's Tower is mapped as a folly building with a courtyard (a multipolygon), which the house kit doesn't build either, so it wasn't there in any form.
- **The features stage** (`tools/coast/src/features.ts`) now keeps:
  - **bridges over the sea:** a road or railway marked as a bridge with at least `bridgeWater` 60 m of its length over the sea. Its deck line, width (at least `bridgeMinWidth` 4 m: Connel's width tag says 2, a lane's), name and structure, from its own tags or the bridge outline mapped round it (Connel's says cantilever). The same crossing mapped twice is kept once. Left out on purpose: a burn's bridge, the road onto a pier (the pier is drawn already: Rothesay's), and the dock gates' swing bridges at Greenock (they open, and the game's bridges can't, yet);
  - **follies** mapped as buildings spanning at least `follyMinSpan` 25 m, with their footprint (McCaig's Tower, 58 m; a 5 m garden grotto on Bute isn't one);
  - **and no floodlight poles as masts:** a mast of the lighting kind (`tower:type=lighting`) isn't a landmark. McCaig's Tower has four floodlight poles round it, which were drawn as 30 m radio masts beside it.
- **The package stage** (`tools/coast/src/package.ts`): a bridge's deck level with the higher ground at its two ends, at least `bridgeMinDeck` 6 m (Connel: 10.7 m, its abutments on the rock); a folly on the lowest ground round its footprint (McCaig's: 55 m, Battery Hill).
- **In the game** (`src/world/coastStructures.ts`, drawn by `src/world/view/coastView.ts`), all of a map's merged into one mesh (one draw call; Oban's about 5,900 triangles):
  - **Connel Bridge**, a deck-on-top steel cantilever: the road level at its deck; under it, a truss each side whose bottom chord runs from a stone pier at the water's edge on each bank up toward the middle, the two arms carrying a shallower suspended span (`suspended` 0.3 of the gap), and back to the abutments; verticals and diagonals every `panel` 10 m. Any other kind of bridge: a deck on girders and piers (`beamSpan` 30 m).
  - **McCaig's Tower**, a ring of arches along its mapped footprint: a pier every `bay` 3.8 m round it (about 47 bays), two tiers of openings under a band each, a sill and a cornice, `height` 11 m in granite grey.
  - These are original low-poly forms made to the map's lines and the structure's kind, not copies of drawings.
  - Settings: `CONFIG.structures` in `src/config/map.ts`.
- **Re-run:** features and package for all four maps. Oban's game file changes in its skyline (four poles gone), bridges and follies only; the Clyde, Tayvallich and Syros get empty bridge and folly lists and nothing else.
- **Not done:** the bridges aren't solid, and there's no mast-against-deck clearance yet (both belong with C6, charted hazards). McCaig's Tower isn't floodlit at night yet, though the map shows where its lights stand.
- **Shared changes:** `src/world/defs.ts`, two optional fields on `RegionDef` (`bridges`, `follies`) and their types (`BridgeDef`, `FollyDef`).
- **Tests:** `tests/coastStructures.test.ts` (5): Connel Bridge a cantilever, its ends on land and its middle over the water, its deck high enough; its model under the deck, reaching down to the piers; McCaig's Tower's footprint, hill and arches; one mesh of a few thousand triangles; no masts by McCaig's. All 1,430 tests pass.
- **Checked headless:** Connel Bridge from the water at 260 m and 110 m (the trusses sloping up from the banks under the level deck); McCaig's Tower from above the town (the ring of arches on its hill, no poles). **Not checked:** the Quest. Expect about 5,900 more triangles and one more draw call in the Oban map.
- **Test steps (VR and desktop):** Voyage → Oban and Lorn.
  1. Look up at the hill behind the town from Oban Bay: McCaig's Tower, the ring of arches.
  2. Sail up past Dunstaffnage to the Falls of Lora (Menu → Debug → World → To port → Falls of Lora pier): Connel Bridge spans the narrows, its steel trusses under the road. You can sail under it (it isn't solid yet).


### Woods: no 3D patches, flat colour beyond the trees; live weather at each Voyage map (map side) (23 Oct 2026)

Owner: "when I go to Oban ... I still see the 3D patches for the low level of detail of the forests, and there's Z fighting on them ... get rid of that level of detail and just have a flat patch on the ground." And: "real-time weather in those locations ... every time you start a game session, for example, a forecast."

**The woods.**
- The far woods' canopy (a bumpy surface a few metres over the wooded ground, out to 1.5 km; 3.5 km on a desktop) is gone: `CONFIG.trees.canopyDistance` 0 (Quest and desktop). Beyond the trees (full trees to 320 m, the middle band's simpler ones to 800 m; 900 m and 3 km on a desktop) the woods are the ground's own colour, painted into every map's ground when it's made (since the earlier shimmer fix). Nothing a few metres over the ground is left to flicker against it. The canopy's code and settings stay, should it be wanted again.
- Fewer triangles too (the canopy was about 2,000 at the Quest setting).
- **Shared change:** `src/world/view/treesView.ts`, a guard: with `canopyDistance` 0 it builds no canopy at all (before, 0 still built the square under you).

**Live weather (the map's half).**
- **Each Voyage map has a point to read its weather at** (`VoyageMap.weatherAt`, `src/world/maps.ts`), in open water so the marine model has sea there: Oban Bay, off Toward Point (Clyde), the Sound of Jura off Loch Sween (Tayvallich), off Ermoupoli (Syros).
- **`src/world/coastWeather.ts`** fetches the current conditions there from **Open-Meteo** (free, no account or key, works from the browser; its terms ask for the credit line `CONFIG.liveWeather.credit`):
  - the weather model's 10 m wind (speed, the bearing it blows from, gusts), cloud, precipitation and visibility;
  - the marine model's wave height, period and direction, as the game's sea scale (about 1.3 m of significant height a unit);
  - turned into the game's weather values: rain at full from `rainMmH` 4 mm/h; visibility no farther than the game draws (`maxVisibility` 20 km); the nearest preset for the sky and the forecast's words (Fog under `fog` 1,000 m, Squall at `squallWind` 15 m/s or thunder, Rain over `rainy` 0.15, Overcast over `overcast` 0.6 cloud, else Clear);
  - given up after `timeoutMs` 8 s, or on any failure, so the game keeps its own weather.
- **In the game** (the main game chat, at the owner's go-ahead, `f77085b` on `next`; its log, docs/progress/game.md): the host fetches it as a Voyage starts and holds it for the session, the marine sea too; a notice, the Voyage tab and the credit line say so.
- **The marine point:** at Oban the marine model answered from 56.29 N, about 14 km out in the Firth of Lorn (it has no sea inside the Sound of Kerrera). That's the right input: the game's sea is the open sea's, and each bay's shelter cuts it down where you are (the map's shelters, ocean/waves.ts), as for the game's own weather. So no separate sea point.
- **Checked live** (23 Oct, mid-afternoon): Oban a 4.9 m/s north-westerly, overcast, dry, waves 0.5 m; the Clyde 5.5 m/s from the north-west; Tayvallich 7.8 m/s, a trace of rain; Syros a 3 m/s north-easterly.
- **Settings:** `CONFIG.liveWeather` in `src/config/map.ts`.

**Tests:** `tests/coastWeather.test.ts` (6, no network): the real Oban answer turned into the game's weather; fog, a gale, thunder, rain and a clear day to their presets; no sea where the marine model has none; the sea scale for a wave height; both services asked for the map's point, and null when they fail; every map's point inside its own box. All 1,418 tests pass.

**Checked headless:** Oban from the bay and Dunstaffnage from Ardmucknish Bay at the Quest setting: no canopy in the scene, the near trees standing, the far woods darker green on the ground. **Not checked:** the shimmer itself on the Quest (headless doesn't show it the way the headset does).

**Test steps (VR and desktop):** Voyage → Oban and Lorn. Look across at the wooded hills (Kerrera, Dunstaffnage) while moving your head: trees near you, the far woods flat green on the ground, no patches floating over them and no flicker. The live weather comes once the main game chat has wired it in.


