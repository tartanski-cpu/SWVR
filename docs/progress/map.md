# Progress: The map

The running record for this area's chat: the coast pipeline, coast regions and Voyage maps. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `tools/coast/`, `coast.html`, `public/regions/`, `src/world/regions/`, `src/world/coast*.ts`, `src/world/maps.ts`, `src/world/view/coastView.ts`, `docs/COAST_PIPELINE.md`, `docs/REGIONS.md`; settings in `src/config/map.ts`.
- **Its tests while working:** `npm run test:map`. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/map/ (branch `preview/map`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

### Fishing grounds on every map, fewer potting grounds on Sunnmøre (30 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "Can it be that I can't see fishing areas on the voyage maps, only lobster potting areas?"; then: "I think there's maybe too many potting grounds on Sunnmøre ... I'd like to have some fishing areas on all the maps. Hamburg can have none because it's an industrial harbour ... make a realistic guess about where those pots would be and the grounds would be."

- **Why:** the pipeline placed one fishing ground per species (350 m across) at the single best depth on the whole map, so a map had 1-3; and lobster is potting, not a ground. Potting grounds went round every charted rock (Sunnmøre 2,746).
- **Fishing grounds** (`package.ts`; `grounds` per species' depth, `groundArea` 25, `groundMax` 8, `groundApart` 2500, `groundReach` 12000, `groundStep` 200, `groundNameReach` 5000): open water of each species' depth, one per 25 km² of it (at most 8 a species), the depth nearest the species' own first, within 12 km of a harbour (a day's run), 2.5 km apart and 900 m clear of harbours. Each named after the nearest well-known place ("Cod ground off Alnes", "Mackerel ground off Hydra Strait"), never twice; farther out by its bearing ("Cod ground north-west of Grasøya"). Herring (10-60 m) and coalfish (25-150 m) now have depths, so Turku's herring grounds appear. Now: Oban 2, Tayvallich 2, Syros 5, the Saronic 8, Turku 11, the Clyde 24, Sunnmøre 40 (cod, coalfish, haddock, mackerel, herring: `sunnmore.yaml`'s fish, with crab for its pots); Hamburg none, as asked.
- **Potting grounds** (`potReach` 8000, `potApart` 250, `potMax` 150): kept where creel boats would set them: within 8 km of a harbour, named rocks first, then those nearest a harbour, never two within 250 m (a request's `pottingApart` instead: Turku's 1,200), and on a map with more than 150 the spacing widened until it has 150 or fewer, evenly spread. Sunnmøre 2,746 → 118, the Saronic 194 → 120, Turku 215 → 133, Syros 43 → 26, the Clyde 24 → 15 (pairs on the same rocks merged), Oban 7, Tayvallich 5. A rock with no name is called after the nearest place ("Rocks off Kosta"), not "Skerry 589".
- **On the chartplotter** (`nav/chartPlotter.ts`; `CONFIG.chartPlotter.groundLabelsWithin` 8000): the grounds' names only at 8 km across or closer; farther out, just their rings (Sunnmøre's names piled on each other).
- **All maps' packages run again** for it: only their grounds changed, and on Oban, Syros and Tayvallich, last run before them, the lamp mast moved off the cargo stack and the pier headings to 0.1° too. Every berth the same.
- **Tests:** `tests/coastGrounds.test.ts` (every Voyage map but Hamburg at least 2 fishing grounds, each named once, 2.5 km apart, within 12 km of a harbour; potting grounds 1-150; Hamburg none). `npm run test:map`, the typecheck and all of `npm test` pass. Seen headless: Sunnmøre's chartplotter at 4 and 16 km.
- **Not checked:** fishing on them in the game (the trawl and the line use them as before), and on the Quest.
- **Shared changes:** `src/nav/chartPlotter.ts` (the names by range, two lines), `src/config.ts` (`chartPlotter.groundLabelsWithin`).

### Buildings streamed on the Clyde, Turku and Hamburg (29 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "Turn on building streaming for Clyde, Turku and Hamburg" (and: "Ålesund is now better at 55 fps on Quest", from 35).

- **Streamed** (`streamBuildings: true` in `clyde.yaml`, `turku.yaml`, `hamburg.yaml`; their package stage run again): each map's buildings now come one file per chunk as the boat comes near, as on the Saronic and Sunnmøre. What you download before the map starts: the Clyde 1.49 → 0.24 MB, Turku 2.50 → 0.67 MB (most of what's left is its 3,276 cottage jetties), Hamburg 2.39 → 0.32 MB. The towns at each start, measured headless, the same as before to within a building.
- **Picked up on the way** (fixes since these maps were last packaged): only buoys are drawn as marks, not beacons (the Clyde 81 → 72, Turku 516 → 514, Hamburg 27 → 21); each port's lamp mast 8 m along the quay from its cargo stack; pier headings kept to 0.1°; Hamburg's ports' middles a little different (their berths the same). Turku's two dry docks are now drawn as graving docks (the Hamburg work): Perno's under the half-built cruise ship, as before with its walls, and the repair yard's at the head of its bay. Every berth id the same on all three.
- **Tests:** `npm run test:map`, the typecheck and all of `npm test` pass. Seen headless: Perno and the repair yard's dock; the towns at the three starts.
- **Not checked:** on the Quest.
- **Shared changes:** none.

### Ålesund on the Quest: fewer draw calls and triangles (29 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "Has Ålesund had all optimisation passes? I get 35 FPS and between 210 and 300 draw calls."

Measured first (headless, as the Quest draws it, one eye: the headset draws both, so about twice these). The processor isn't the limit (the game's own code is a small share of a frame); the drawing is. At the start, 176 draw calls and 273,000 triangles: the sea 104,000, Ålesund's buildings 48,000, the harbour kit 36,000, the ground 1-6 km out 23,000 in 39 pieces, the near ground 20,000, the lateral beacons drawn as buoys 17,500, the lighthouses and light posts 13,700.

- **The ground ring merged** (`coastView.ts` `mergeMid`; `regions.coastCoarseWedges` 8): the ground from 1 to 6 km out was a mesh (and a draw call) per 2 km chunk, 10-18 a view. Now the chunks are merged into 8 slices round the viewer, so those behind are still left out: at most 8 calls, about 3 in view. Merged again only when the chunks in the ring change (every couple of km). Every coast map.
- **Coarser on the Quest** (`regions.coastQuest.coastCoarseCell` / `coastCoarseOverlap` 125, from 90 m): the ring's mountains a little plainer, about half the triangles. Seen headless: the Storfjorden's and the town's hills read as before, no gaps.
- **Beacons aren't buoys** (`package.ts`): after the isolated-danger beacons, the lateral ones too (98 here): a beacon is a pole on its rock, and every mark is drawn everywhere. Only buoys are marks now (53 here). Sunnmøre's package run again; the other maps on their next run.
- **Light posts near only** (`worldView.ts` CoastKit): the lights and landmarks were one mesh always drawn; a light on a post now goes in its harbour-kit square, drawn within its reach. The light itself is drawn apart and still seen from afar; only the lighthouses stay in the always-drawn mesh (Ålesund's 13,700 → 1,100 triangles).
- **Result** (one eye): the start facing the boat 176 → 163 draw calls, 273,000 → 204,000 triangles; facing the town 77 → 68, 238,000 → 185,000; off the town 84 → 77, 243,000 → 190,000; the Storfjorden 106 → 92, 207,000 → 179,000.
- **What's left, not the map's:** the sea surface, 104,000 triangles a view (more than half of what's left; `CONFIG.ocean.mesh`, the main game chat's), and your own boat: looking at her wheelhouse, some 80 of the draw calls are her fittings and controls, each its own. Those two are where the next big gain is.
- **Tests:** `tests/coastViewBudget.test.ts` (the ring drawn in at most 8 slices, the chunks kept as before, none both near and far). `npm run test:map`, the typecheck and all of `npm test` pass.
- **Not checked:** the frame rate on the Quest itself.
- **Shared changes:** `src/world/view/worldView.ts` (light posts into the kit's squares, a few lines).

### Ålesund and Sunnmøre: West Norway's fjords (28 Oct 2026)

**Owner approved; merged into `next`.**

Owner, with a map picture of Sunnmøre (Ålesund, Sula, Hareidlandet, Gurskøya, the Vartdalsfjorden to Ørsta): "Next area to make into a map".

- **The map** (`tools/coast/requests/sunnmore.yaml`): Ålesund on its islands, Ellingsøya, Valderøya, Vigra and Godøya, Uksenøya and the Brusdalsvatnet, Sula and the Åsefjorden, the Breisundet, Hareidlandet with Hareid, Brandal and Ulsteinvik, Gurskøya and Herøy (Fosnavåg), the Vartdalsfjorden and the mouth of the Storfjorden, south to Ørsta. 55.4 by 52.3 km at full scale, 52 % land, the mountains over 1,000 m straight out of the fjords. 716 chunks (none over 10,795 drawn faces), 57.7 MB of mesh, streamed as ever; buildings streamed as Saronic's (133 files, 14,751 buildings). 106 ports, 167 berths, 955 pier and quay pieces, 22 named ferry lines (Hareid - Sulesund, Ålesund - Langevåg, Sykkylven - Magerholm, Festøya - Solavågen, the Hurtigruten...).
- **The West Norwegian theme** (`tools/coast/src/themes.ts` `west-norwegian`): grey gneiss and heath above the fields to bare rock and snow; spruce in planted blocks, pine on the knolls, birch to a 450 m treeline; white and red wooden houses, some yellow, grey and pale blue, under dark roofs, red boathouses; open boats and small fishing boats at the quays, motor cruisers, few moorings. Invented Norwegian names for its ferries.
- **In Voyage** (`src/world/maps.ts`): you start at Ålesund (`alesund-cargo`, in the Brosundet), the weather live from off Hareid, its run of weather the Atlantic's (`NORWEGIAN_WEATHER`: overcast and rain the most, squalls in the westerlies, fog in the calms, now and then a still clear day). On the front page's list and chart.
- **Names** (`sunnmore.edits.yaml`): Ålesund (the map's "Stornespiren"), Hareid, Ulsteinvik, Fosnavåg, Ørsta. And every map's ids now spell Norway's letters out (`common.ts` `slug`: Lepsøya is `lepsoya`, not `leps-ya`; ø, æ, œ and the like).
- **Mountains within the Quest's budget** (`mesh.ts` `chunkFill` 0.9): the refinement stops adding points to a chunk once it has 90 % of its `chunkBudget` (12,000 faces); first time round, steep mountains out of an intricate coast put 16 chunks over it (the worst 18,556). The rest of the refinement goes elsewhere. Every map's next run (the others were all under it).
- **Fixed beacons aren't buoys** (`package.ts`): the game draws its marks afloat, as buoys. Norway charts its skerries with beacons, poles on the rock: 435 isolated-danger beacons here, each drawn as a 370-triangle buoy, everywhere: 162,000 triangles, a third of the frame. Left out; their rocks are in the ground and the chart's shallows. (The lateral beacons, 98, stay, as buoys.)
- **The lamp mast off the start spot** (`package.ts` `lampAlong` 8): a port's lamp and flood light stood at its cargo stack, among the crates and on the spot a step ashore where the game puts you (a dark post in your face at the start, at Poros and Ålesund). Now 8 m along the quay, on the same deck (whichever way stays on it). Saronic's package run again for it (only its lamps moved); the other maps get it on their next run.
- **Measured** (headless, as the Quest draws it): loaded in 8.5 s; the start at Ålesund 170 draw calls, about 226,000 triangles before the town is built and 275,000 with it (424,000 before the beacons went).
- **Tests:** `tests/coastSunnmore.test.ts` (the box and chunks within the budget, Ålesund's latitude and longitude, the mountains over 1,000 m, the buildings streamed, the start berth in deep water on the detailed ground, the towns as ports, the ferry lines over water). `npm run test:map`, the typecheck and all of `npm test` pass. Seen in the game headless: Ålesund's quay and town, the Storfjorden and the Vartdalsfjorden from the water.
- **Not checked:** on the Quest (load time, frame rate).
- **Worth knowing (for the owner):** each address of the site (the game, /next/ and each area's preview) carries its own copy of every map. Today's published site is 238 MB compressed; with Saronic and Sunnmøre in all six copies it would be over 1.5 GB, past GitHub Pages' 1 GB guideline. A fix, for the owner or the main game chat (the workflow is shared): the copies could share one set of map files. Not urgent while the big maps are only on the map preview.
- **Shared changes:** `index.html` (the link).

### The front page's chart of the maps (28 Oct 2026)

**Owner approved; merged into `next`.**

Owner: the Saronic map "doesn't show up in preview as the front page does not account for the new map, maybe put an interactive map there so you can look around the map and choose an area". (The link was there; the preview hadn't published the new build yet when they looked.)

- **The chart** (`src/world/coastMapPicker.ts`; the Voyage tile's **Choose on the chart**, or the address `index.html#maps`): Europe with every Voyage map marked, full screen. Drag to look round, scroll or pinch to zoom (+, − and "every map" buttons too; Esc or × closes, and so does Back). A map's box opens out into its own coast and harbours as you zoom in (its coast from 70 px wide, its harbours from 260 px); the start harbour is blue. Pick a map (on the chart or from the row of names) and the panel gives its blurb and **Sail the map** (where you were last time, or its start); pick a harbour and it gives **Start at <harbour>**. Mercator, plain 2D canvas, nothing of the game loaded.
- **Starting at a chosen harbour** (`src/world/maps.ts`): the address `voyage.html?map=<id>&start&berth=<berth id>` starts at that berth instead of the map's start berth (only for the map the page shows; `start` forgets where you were). Checked: Saronic from Poros pier starts moored there.
- **Its data** (`tools/coast/src/overview.ts`, `node src/overview.ts`): one file, `public/regions/overview.json`, 322 KB (about 100 KB as the site sends it, compressed): Europe's land and borders from Natural Earth's 1:50 million set (public domain), thinned to 0.03°; each map's coastline traced round its reconciled land grid (coarsened to at most 700 cells across, thinned to 0.8 of a cell, islets under 3 cells left out); its name, blurb and start berth read from `maps.ts`; its ports from its package, each with the berth a start there uses (its cargo berth, else its first). Run it again after adding a map or changing one's harbours.
- **Tests:** `tests/coastOverview.test.ts` (every Voyage map listed as `maps.ts` names it, in its order; each offered berth one its map has, each port in its box, the start berth among them; the file under 400 KB). `npm run test:map`, the typecheck and all of `npm test` pass. Seen headless: the chart of Europe, Saronic and Hamburg opened out, Poros picked, on a phone-sized screen.
- **Not checked:** on the Quest's browser (the front page there: it should work with the controller as a pointer, but I couldn't try it), or with a real touch screen (pinch was tried only as code).
- **Shared changes:** `index.html` (the button, and the script tag for the chart).

### The Saronic Islands, and big maps' buildings streamed (28 Oct 2026)

**Owner approved; merged into `next`.**

Owner, from a map picture: "I'd like the Saronic Islands next"; "include Hydra and Spetses too"; "include Ermioni and Porto Heli harbours as ports too"; on loading: "is there any way to stream in the data?" ... "Yes, build the streaming for the Saronic map".

- **The map** (`tools/coast/requests/saronic.yaml`): Aegina and Agia Marina, Agistri, Methana, Poros and Galatas, Hydra, Dokos, Spetses, and the Argolid coast from Pefkali and Korfos past Epidavros to Ermioni, Kosta and Porto Heli; the islets of the gulf. 44.1 by 74.5 km at full scale, the biggest map (the Clyde is 36 by 37), 35 % land, heights to 1,119 m. The Aegean theme, as Syros. 483 chunks (none over 11,633 drawn faces), 38.5 MB of mesh, streamed as ever. 65 ports, 88 berths, 460 pier and quay pieces, 2,666 buildings (those within 400 m of a harbour, as on every map), 50 named ferry lines (`ferriesNamed`), from Piraeus and between the islands, and the Poros strait's.
- **Names** (`saronic.edits.yaml`): Aegina (the map's "Limenas Skafon Anapsychis"), Spetses ("Spétses pier"), Spetses (Tsaldari pier), Galatas (its taxi-boat landing on the strait), Agistri (Myloi) and (Skala), Ermioni ("Ermioni ferry port"), Porto Heli (the owner's spelling of the map's "Porto Cheli": its town quay).
- **In Voyage** (`src/world/maps.ts`): you start at Aegina (`aegina-cargo`), the weather live from the middle of the gulf; on the landing page beside Hamburg.
- **Streamed buildings** (`streamBuildings: true` in the request; `package.ts`; `coastView.ts` `fetchBuildings`; `coastStream.ts` `fetchJson`): a big map's buildings were most of its package (Hamburg 2.13 of 2.45 MB). Streamed, the package keeps only those within `keepNearBerth` 60 m of a berth (the start and the planning table look for them first), and the rest go one file per chunk (`buildings/<n>.json`), fetched as the viewer comes within the town's reach of it, its town made again when they're in; a failed fetch is tried again. Saronic's package is 0.31 MB, its buildings in 91 files. Tried on Hamburg first (and put back): the package 2.45 → 0.33 MB, the town's triangles at the start and at HafenCity exactly as before. Only Saronic streams for now; the other maps can take it by adding the line and running their package again.
- **A berth's spot ashore on its own deck** (`package.ts` `ashoreOnDeck`): a cargo or fuel berth is chosen only where the highest deck at the spot a step ashore is the berth's own (at Agistri's Myloi a 3.5 m quay overlaps the 2.4 m pier the fuel berth was on, and the game would have stood you on the quay). Every map's next run.
- **Measured** (headless, as the Quest draws it): loaded in 4.5 s, the start at Aegina 169 draw calls, 266,000 triangles.
- **Tests:** `tests/coastSaronic.test.ts` (the box and chunks, Aegina's latitude and longitude, the streamed buildings each in its own chunk's file, the start berth and the ports the owner named, the ferry lines once each over water); `tests/coastStreamBuildings.test.ts` (the streamer's fetch). `npm run test:map`, the typecheck and all of `npm test` pass. Seen in the game headless: Aegina's quay, Hydra's harbour, Poros, Spetses.
- **Not checked:** on the Quest (how long it really loads, the frame rate, and whether a town arriving shows as a hitch).
- **Shared changes:** `index.html` (the link). In my area otherwise.

### Hamburg: muddy Elbe water; the small structures and the quay cranes drawn near only; why the waves stay small (28 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "Hamburg is still a bit heavy, I noticed the weather debug doesn't affect the waves much too, oh and Hamburg has muddy brown water" (asked: "make it muddy brown", like the real Elbe).

- **Muddy brown water** (`water` in the request: deep `#2e2c1c`, scatter `#6e6234`; `RegionDef.water`; `OceanView.setWater`, applied by `App.ts` with the shelters, once a second, by the map you're on): the Elbe's turbid olive-brown in place of the sea's blue. Every other map keeps the sea's colours (CONFIG.ocean.colors).
- **Lighter** (`coastView.ts`): the map's own structures were one mesh drawn everywhere, 29,500 triangles. Now only the skyline is (the landmarks, the big bridges: `structures.farBridge` deck 20 m or 400 m long, or cable-stayed; a shipyard's goliaths, the ships building, the graving docks), 10,200; the rest (the small bridges, Altenwerder's stacking cranes, the museum ships, the floating docks) in 1 km squares (`structures.nearCell`), drawn within the harbour kit's reach. On the Quest the quay cranes go a terminal at a time, within `coastQuest.craneDistance` 3.5 km. Measured as the Quest draws it: the start 363,000 → 347,000 triangles, Burchardkai 328,000 → 302,000, HafenCity 358,000 → 338,000; draw calls about the same (153).
- **What's left is mostly the main game's:** the ocean surface 104,000 triangles (a third of what's drawn, the same on every map), the boats' wakes 17,600. The Quest's counter shows about twice what's drawn (both eyes), so the ocean is about 200,000 of what it shows: the place for the next big saving, the main game chat's (`CONFIG.ocean.mesh`).
- **The waves, found, not changed:** the game's wind sea by fetch (`ocean/windSea.ts`, `world/fetch.ts`, the main game's) scales the open sea's waves, the ones the debug's sea height sets, by each spot's exposure to open water. On the Elbe that is 0.4-3 % (the river is a few hundred metres wide, its fetch short), so the debug's sea height barely shows; and the short wind sea in a 14 m/s wind comes out at about 1 cm, where a fetch-limited sea of a few hundred metres would make 10-30 cm. Realistic in that a river port has no swell; too calm for its chop. For the main game chat: the river's effective fetch on the 150 m fetch grid.
- **Tests:** `npm run test:map`, the typecheck and all of `npm test` pass. Seen in the game headless: the Elbe brown from the Landungsbrücken and at the Überseebrücke, the museum ship and the small bridge there drawn close.
- **Not checked:** on the Quest.
- **Shared changes:** `src/ocean/oceanView.ts` (`setWater`), `src/app/App.ts` (the map's water colour, a few lines), `src/world/defs.ts` (`RegionDef.water`). Settings in `src/config/map.ts` (`structures.nearCell`, `farBridge`, `regions.coastQuest.craneDistance`).

### Hamburg runs lighter: fewer pier legs, the piles the fenders, shorter reach on the Quest (28 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "it's 750,000 triangles. On Quest, I'm getting 30 to 40 frames per second ... the piers have many legs ... and separate fenders or bumpers. You could ... reduce slightly the leg count and merge the leg with a bumper ... take a look at the poly count."

- **Measured first** (headless, every visible mesh's triangles by name, instanced ones counted per copy; 3 spots: the start, Burchardkai, HafenCity). The biggest share by far was the harbour kit's piers and quays (`structures`): 164,000 at the start, 180,000 at HafenCity. Hamburg has 645 pier and quay pieces, mostly long timber piers: a pile every 6 m each side (7-sided cylinders, capped), a fender board every 4 m on every seaward face, bollards of two 8-sided cylinders each. Then the ocean (104,000, the main game's, not changed here), the town's buildings (50-62,000), the container stacks (28-61,000).
- **The piers** (`worldView.ts` buildBlock, shared; `CONFIG.structures.kit`): piles every `pileSpacing` 9 m (from 6), 5-sided (from 7), open-ended (no caps: their tops are under the deck, their feet in the seabed); a pier's outer piles are its fenders, so it has no fender boards (owner's idea); a quay keeps its fender boards, every `fenderSpacing` 8 m (from 4). Bollards one 6-sided post with a flat cap (from two 8-sided cylinders). Every map's piers (and the career harbours') take it.
- **The container stacks:** no bottom faces (never seen), and drawn within 2.5 km (from 3.5).
- **On the Quest only** (`CONFIG.regions.coastQuest`, by the trees' device level: a standalone headset, or "Quest" chosen in the menu): the town's buildings within 1.3 km (from 2), the harbour kit's squares within 1.6 km (from 2.5), a terminal's stacks within 1.8 km. Fog hides most of that distance on the water anyway. The desktop keeps the longer reach.
- **Result, measured as the Quest draws it** (before → after): the start 529,000 → 363,000 triangles; Burchardkai 450,000 → 328,000; HafenCity 538,000 → 358,000: a third fewer. The piers alone: 164,000 → 43,000 at the start, 180,000 → 45,000 at HafenCity. Draw calls unchanged (about 90 on the water, 150 at the start). On a desktop the same scenes are 453,000 / 401,000 / 460,000.
- **What's left:** the ocean (104,000, the biggest single mesh now, the main game's: worth telling the main game chat), the harbour boats near (up to 40,000), the town. 750,000 on the Quest's counter will include both eyes' and the shadows' passes; the scene's own share is what's measured here.
- **Tests:** `npm run test:map`, the typecheck and all of `npm test` pass. Seen in the game headless: the piers along Altona still read as piers on piles.
- **Not checked:** on the Quest (the frame rate there is the owner's check).
- **Shared changes:** `src/world/view/worldView.ts` (pier piles, fenders, bollards: every map and the career harbours). Settings in `src/config/map.ts` (`structures.kit`, `regions.coastQuest`).

### Hamburg: containers and quay cranes on the terminals (28 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "Add containers and quay cranes to the terminals".

- **The terminals** (`containerTerminals` in the request, by their names in the map; `features.ts` takes each area): Container Terminal Burchardkai, Eurogate Container Terminal Hamburg, Container Terminal Tollerort, Containerterminal Altenwerder. The map draws neither the cranes nor the boxes, so the package stage lays them out (`package.ts`, the terminals pass):
  - **Quay cranes:** along every quay wall in or beside a terminal (within `termReach` 80 m), on its face to the water, one every `craneSpacing` 100 m, `craneEnd` 35 m clear of the ends, standing `craneBack` 18 m in from the face, the boom out over the water; three in ten with the boom raised, as when no ship lies there. 66 cranes: Burchardkai 28, Eurogate 16, Altenwerder 15, Tollerort 7, about the real numbers.
  - **Container stacks:** blocks 60 x 22 m (`stackBlock`) with lanes between (`stackLane`) on a grid squared to the terminal's main quay, wherever a block's middle is in the area, on land, no water within `stackBack` 60 m, clear of the buildings. 1,279 blocks, each four stacks of 1 to 5 containers high in mixed colours.
- **The crane** (`coastStructures.ts` `quayCraneGeometry`, `CONFIG.structures.terminal.crane`): an A-frame portal on four legs straddling the quay (30 m between its rails), the boom 62 m out over the water and 22 m back, the machinery house on the back end, the cab, the A-frame head stayed to the boom's ends. Blue frame, white boom. A design of the game's own.
- **Cheap on the Quest** (`coastView.ts`): instanced. All the cranes are two instanced meshes (boom down, boom up), 252 triangles each, 17,000 in all, always drawn (they're the port's skyline); each terminal's stacks are one instanced mesh (8,700 to 19,000 triangles) drawn only within `terminal.distance` 3.5 km. At the start (the Landungsbrücken) the scene is unchanged: 151 draw calls, 320,000 triangles in the headless browser; near Burchardkai and Eurogate about 55,000 triangles more in five draw calls.
- **Drawing only, not solid**, like the other structures.
- **Tests** (`coastHamburg.test.ts`): the four terminals with cranes and stacks; every crane on its quay with its boom over the water; the stacks on land; the budgets. `npm run test:map`, the typecheck and all of `npm test` pass. Seen in the game headless at Burchardkai and Eurogate.
- **Not yet:** straddle carriers and lorries between the stacks; cranes working (the boom and trolley still); the ships' own cranes alongside.
- **Not checked:** on the Quest (the frame rate near the terminals is the owner's check).
- **Shared changes:** `src/world/defs.ts` (`TerminalDef`), `src/world/coastStructures.ts`. Settings in `src/config/map.ts` (`structures.terminal`).

### Hamburg: ships in the docks, water in Elbe 17, no buildings on the pontoons (28 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "the Blohm + Voss dry dock seems to still have land inside it ... a grey mass"; "there should be some ship inside the docks as well"; "the buildings on the dock side next to the Cap San Diego seem to be a bit high. I don't think there should be any buildings on those pontoons."

- **Dock basins are water** (`reconcile.ts`): the land cover sees a dock with a ship in it as built-up, so Elbe 17's basin came out as land at ground level. Every cell inside a mapped dock outline (`waterway=dock`) is now water, and a patch mostly of dock counts as water. Every stage from the reconcile on was run again for Hamburg.
- **A cruise ship in Elbe 17 for a refit** (`yardShips: [{ dock: Dock Elbe 17, stage: 0.97, length: 290, painted: true }]`): the Turku yard ship's design, finished and painted, afloat (a ship in a flooded dock floats at `yardDraught`; one in a drained dock, Perno's, stands on its floor as before).
- **A ship in each big floating dock** (`dockedShips: true`; `package.ts`, `T.dockedShip` 150 m, `T.dockedLift` 9.5 m; `MuseumShipDef.lift`): the museum ships' cargo design, raised on the dock's blocks (her keel a metre over the pontoon deck), 0.8 of the dock's length, her beam within its wing walls; her hull's colour and which way she lies by the dock's name. Five docks: 11, 5, 12, 16 and I.
- **No buildings over the water** (`package.ts`): a building whose middle stands over water is left out: the map's pavilions on the pontoons by the Überseebrücke, which the house rules had made 15 m warehouses.
- **Tests** (`coastHamburg.test.ts`): Elbe 17 water with the cruise ship afloat in it; a ship raised in each big floating dock inside its walls; no building on the pontoons by the Cap San Diego. The start berth's depth test now asks 2 m, not 3, in the overview grid (the same berth; the re-triangulated mesh blends the pontoon's face a little more into the 50 m cell). `npm run test:map`, the typecheck and all of `npm test` pass. Seen in the game headless.
- **Not checked:** on the Quest.
- **Shared changes:** `src/world/defs.ts` (`MuseumShipDef.lift`).

### Hamburg: big ships in and out, and harbour ferries of the port's own kind (28 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "Hamburg, being a busy harbour, needs some AI ships, some big ships going in and out. And the ferries should look a little bit more like the Hamburg ferries ... they've got a wheelhouse at the back, and then the cabin at the front."

- **Container ships** (`shipping` in the request; `package.ts`): three routes, each in from the map's west edge up the Elbe to a terminal's cargo berth: Burchardkai, Predöhlkai (Waltershof) and Ballinkai (Altenwerder, through the Köhlbrand under the bridge). Each way is the cheapest path through water at least 8 m deep (`T.shipDepth`) on a 50 m grid (`shipCell`), kept 450 m inside the box's faded edges (`shipEdge`), each cell dearer the nearer the bank (`shipBank`), so they keep to the middle of the channel, then thinned (`shipThin`). At the quay she lies `shipOff` 26 m out from the face, her whole length over deep water (slid along the face from the berth until she fits), coming in along the quay from the longer open side.
- **They sail as the ferries do** (`traffic/ferries.ts`, unchanged but for one rule): in from the edge, slowing into her berth, alongside 8 minutes, off to sea with a call on the VHF ("Nordic Meridian, leaving Burchardkai for the sea"), out of sight half an hour, back in; on the AIS, lit at night, solid, keeping her course and stopping rather than run you down. The three routes share the sea end, so they're one fleet of three ships. Names invented (`SHIP_NAMES`), three hull liveries of the game's own (dark blue, dark red, grey).
- **A fleet is one class** (`ferries.ts` `fleets`): routes are grouped by a shared end only within one class, so a harbour ferry never sails a container route (both use Bubendey-Ufer, say).
- **The container ship design** (`ferryKit.ts` `container`, `CONFIG.ferries.classes.container`: 300 x 45 m, 12 m draught, 4.2 m/s): her hull, the accommodation block and bridge aft with its wings across her beam, the funnel behind, bay after bay of containers in mixed colours, three stacks across, each 3 to 6 high, lashing bridges between.
- **The harbour ferry** (`ferryKit.ts` `harbour`; `harbourFerries: true` in the request makes Hamburg's 11 launch lines this class; `CONFIG.ferries.classes.harbour`: 30 x 8.2 m, after the port's "Bügeleisen"): a beamy shallow hull, the enclosed cabin forward with its windows, its roof an open upper deck behind a rail; aft, the wheelhouse raised on an arch over the open after deck and the boarding ramp. One colour all over, hull and upperworks, yellow or red by turns down the lines (liveries `harbour-yellow`, `harbour-red`; owner: "typically like all yellow or all red"), a dark boot-topping and dark windows.
- **Tests** (`coastHamburg.test.ts`): the three ship routes to their terminals, all in water to the end alongside; a fleet is one class; the harbour ferry lines; each design within budget. `npm run test:map`, the typecheck and all of `npm test` pass. Seen in the game headless: a ship alongside at Burchardkai, another under way up the Elbe, a harbour ferry at her pier.
- **Not yet:** cruise ships, bulk carriers and tugs; the ships don't meet the ferries' timetables (they keep clear of you, not of each other beyond the ferries' rules).
- **Not checked:** on the Quest.
- **Shared changes:** `src/config.ts` (`ferries.classes.harbour`, `.container`), `src/traffic/ferryKit.ts` (the two designs, liveries, their lights), `src/traffic/ferries.ts` (`fleets` by class), `src/world/defs.ts` (`FerryRouteDef` classes and liveries).

### Hamburg: the Dockland, the museum ships, Blohm + Voss's docks (28 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "Make sure you do the slanty Dockland building and the Cap San Diego and the Rickmer ships in the harbour. Oh, and the dry docks from Blohm + Voss shipyard, of course."

- **The Dockland** (`landmarkModels`, `osm: way/19742852`): the office on the tip of the Fischereihafen pier, 25 m, its outline from the map; a parallelogram in elevation, leaning `lean` 40 m out at its top toward `leanBearing` 270 (west, over the Elbe) (`coastStructures.ts` `leaningBlock`). Glass and steel grey (`wall` in the request: a landmark's colour where the map has none). The ground under it flattened as for the other landmarks.
- **The museum ships** (`museumShips` in the request, by Wikidata id; `features.ts` takes each hull outline from the map: where she lies, her heading toward her bow (the narrower end of the outline), length and beam; `coastStructures.ts` `museumShipParts`, `CONFIG.structures.museumShip`). Designs of the game's own:
  - **Cap San Diego** (159 m, `cargo`): a 1960s cargo liner, white hull over a red bottom, forecastle and poop, her superstructure in four tiers amidships with bridge wings, her funnel white with a red top, kingposts and derricks over the hatches fore and aft;
  - **Rickmer Rickmers** (87 m, `barque`, 3 masts, green hull) and **Peking** (101 m, 4 masts, black hull; in the Hansahafen, not asked for but there): a square-rigger, a white band under her rail, poop and forecastle, masts crossed with six yards each, the aftmost with gaff and boom, bowsprit and forestay.
  - The boxes the harbours stage had made of their hull outlines (mapped as buildings) are left out.
- **Floating docks** (every one the map has as `waterway=dock`, `dock=floating`; `floatingDockParts`, `CONFIG.structures.floatingDock`): Blohm + Voss's Docks 11 (319 m), 5, 6, 12 and 16, and Docks I and II across the river: the pontoon just awash, a wing wall each side (0.42 of its breadth high, 12-20 m), the copings, a yellow jib crane on each wall.
- **Dock Elbe 17** (the graving dock, from the map's `dock=drydock`; `gravingDocks` in the package, `gravingDockParts`): its gate across the end that opens onto the river, and two big portal cranes along its side.
- **Tests** (`coastHamburg.test.ts`): the Dockland's lean, each ship at her berth afloat with no shed over her, her masts or funnel, the docks' sizes and the gate on the river end; each within its triangle budget. `npm run test:map`, the typecheck and all of `npm test` pass. Seen in the game headless.
- **Drawing only, not solid**, like the yard ships and gantries: a boat sails through them. Making them solid is a new physics shape: the owner's call.
- **Not checked:** on the Quest.
- **Shared changes:** `src/world/defs.ts` (`MuseumShipDef`, `FloatingDockDef`, `GravingDockDef`, `LandmarkModelDef.lean`), `src/world/coastStructures.ts` (`structuresGeometry` takes the rest as one object). Settings in `src/config/map.ts`.

### Hamburg: its landmarks, from the map's own 3D (28 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "Add landmarks first" (before the container terminals).

- **Modelled from the map data, not by hand** (`features.ts`, `landmarkModels` in `requests/hamburg.yaml`): OpenStreetMap has Hamburg's landmarks drawn in 3D, as building parts with heights, roof shapes and colours (its "Simple 3D Buildings"). A request names a landmark by its Wikidata id (or an OSM way, `osm: way/<n>`, where its building has none: the Landungsbrücken hall), and the features stage takes the building parts inside its outline. Nine for Hamburg:
  - the Elbphilharmonie (110 m);
  - the five main churches: St. Michaelis (the Michel, 132 m, its green copper top in stages), St. Petri (132 m), St. Nikolai (147 m, the ruin's spire), St. Jacobi (125 m), St. Katharinen (117 m, its green bulb);
  - the Rathaus (its tower 112 m);
  - the St. Pauli Landungsbrücken hall with its towers, and the old Elbe tunnel's domed hall.
- **How they're drawn** (`coastStructures.ts` `landmarkModelParts`, one merged mesh with the bridges, 4,000 triangles for all nine): each part's footprint walled up to its eaves and roofed in its shape: flat, pyramidal (spires), dome, onion, gabled (four-sided footprints), skillion, and a hip for the rest. In the map's colours, else by material (`CONFIG.structures.landmark`).
- **The Elbphilharmonie's crown** (`crown: wave`): the map can't describe its roof, so its glass top is crested in 2.5 waves along its length, 22 m from crest to trough (`landmark.wave`), across the whole footprint; the overlapping glass shell the map also has is left out inside it.
- **The ground under them** (`mesh.ts`): the height data is a surface model, so the Elbphilharmonie was in it as a 25-30 m mound that buried the model. Under each landmark's footprint (and `landmarkPad` 6 m round it) the ground now comes down to the land about it (the lower quarter of the heights 15-45 m outside, `landmarkRing`): 282 cells. Water isn't raised.
- **Not drawn twice:** the plain buildings in their footprints are left out (5), and the skyline's generic church and tower symbols there are marked `modelled` (not drawn, still on the chart).
- **The Köhlbrandbrücke cable-stayed** (`bridgePylons: { Köhlbrandbrücke: 135 }`; `bridgeParts`, `CONFIG.structures.cableStayed`): the piece over the Köhlbrand gets an A-frame pylon at each edge of the water, 135 m high, with fans of 9 stays a side to both deck edges; the main span free of piers, the approaches on piers every 45 m. A design of the game's own to the map's line.
- **Tests** (`coastHamburg.test.ts`): all nine at their mapped heights, the crown's dip, the flattened ground, every wall facing out, the budget, the bridge's pylons. `npm run test:map`, the typecheck and all of `npm test` pass. Seen in the game headless: the Elbphilharmonie from the river and from above, the old town's spires from the Zollkanal, the Landungsbrücken, the Köhlbrandbrücke from the Köhlbrand.
- **Not yet:** the TV tower (Heinrich-Hertz-Turm, 280 m) stands 300 m north of the map's edge, so it isn't in; widening the box means fetching and building the map again. The museum ships (Rickmer Rickmers, Cap San Diego) and the container terminals are still to come. The landmarks stand among few other buildings away from the harbours (the map brings in buildings within 400 m of a harbour only).
- **Not checked:** on the Quest.
- **Shared changes:** `src/world/defs.ts` (`LandmarkModelDef`, `BridgeDef.pylons`, `SkylineDef.modelled`), `src/world/view/skylineView.ts` (skips a modelled one), `src/world/coastStructures.ts`. Settings in `src/config/map.ts` (`structures.landmark`, `structures.cableStayed`).

### The Port of Hamburg: a river port, the first map without a coastline (27 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "I'd like a Hamburg harbour map".

- **The map** (`tools/coast/requests/hamburg.yaml`): the Elbe from Finkenwerder and Övelgönne up to the Elbe bridges, at full scale, 13.9 by 7.8 km, in 28 chunks (none over 8,100 drawn faces): the Landungsbrücken (where you start, `landungsbrucken-cargo`), the Speicherstadt and HafenCity, Blohm + Voss, Burchardkai, Altenwerder and Eurogate, the Köhlbrand, Wilhelmsburg and the free port's docks. For Voyage only (`src/world/maps.ts`, live weather off the Elbe, `ELBE_WEATHER`), on the landing page beside Turku. 77 ports, 137 berths, 9,400 buildings, 645 pier and quay blocks; 2.4 MB.
- **Water with no coastline** (`reconcile.ts`, `inlandWater`): the map data has no coastline this far up a river, so the sea came out as one solid field. Now the map's own water outlines (river banks, docks, canals, lakes) bound the land and water patches too, and a patch with no sea seed in it is water when at least half of it is water in the land cover (ESA WorldCover). Its depth: 2 m at the bank, 0.25 m deeper a metre out, held to `inlandDepth` (15 m: a dredged fairway's, the real channel being about 16 m). Every other map leaves `inlandWater` off and is unchanged.
- **The Hanseatic theme** (`themes.ts` `hanseatic`): red-brick warehouses and terraces, slate-grey, green copper and red roofs, stone revetments and the river's mud at the water's edge; lime, oak, plane and birch in the parks.
- **The harbour ferry lines:** each line once (`ferriesNamed`, as Turku), 12 lines; a line the map knows only by its number reads "Line 62" (`package.ts`, every map from its next run).
- **The Köhlbrandbrücke 55 m up:** the map gives no height, so its deck was drawn at its abutments' ground, 9 m, under which nothing could pass. A request now gives a bridge's deck by name (`bridgeDecks`, `common.ts`; here `Köhlbrandbrücke: 55`, every piece of it: about 53 m clear in life). Drawn as a beam bridge on tall piers, not yet with its cable-stayed towers.
- **Gantries to their own size** (`coastStructures.ts` `gantryParts`; `CONFIG.structures.gantry.fullSpan` 150 m, `bareBelow` 0.5): Altenwerder's 25 stacking cranes are mapped as gantry tracks 40 m between the rails, and came out as 100 m goliaths. Now a gantry under `fullSpan` is scaled by its span (a 40 m one 27 m tall), and under half size has no T-crane and no sign. Perno's is unchanged (156 m).
- **No creel grounds where a map lists no fish** (`package.ts`): Hamburg had two "Skerry" grounds in the docks.
- **Yachts only on mooring buoys** (`boats.ts`): Hamburg maps 1,100 "moorings" that are piles, dolphins and bollards along the quays (ships lie against them); the stage put a yacht on a mooring at each, 400 of them against the piers. Now only buoys are taken (172 moorings, all the stage's own).
- **Berths a step from a deck** (`package.ts` `ashoreOnDeck`, `T.quayBack` 2 m as the game's `CONFIG.start.quayBack`): a cargo or fuel berth is chosen only where the spot the game puts you ashore is on a deck. And a pier or quay's heading is kept to a tenth of a degree (it was whole degrees, which on Ballinkai's 1.5 km quay moved its far end 13 m sideways, off its own berth). Both from each map's next run.
- **Tests:** `tests/coastHamburg.test.ts` (the box and chunks, the Landungsbrücken's latitude and longitude, the Elbe water and dredged, St. Pauli and Wilhelmsburg land, the start berth's depth and the ports, the ferry lines once each over water, the Köhlbrandbrücke at 55 m over the Köhlbrand). `npm run test:map`, the typecheck and all of `npm test` pass. Headless: the start at the Landungsbrücken (12 s to load, 154 draw calls), HafenCity's marinas, the Elbe, Altenwerder's cranes, the Köhlbrandbrücke.
- **Not yet:** no containers on the terminals, nor the quay's ship-to-shore cranes (the map has their tracks, not the stacks): the terminals are bare ground; the Köhlbrandbrücke's towers and cables; the Elbphilharmonie as an ordinary building. Several piers share a name (five "Waltershof pier"), named for the nearest place by the harbours stage. 13 overlapping-pier and no-room warnings in the package report, as on the other maps.
- **Not checked:** on the Quest.
- **Shared changes:** `index.html` (the Hamburg link), `src/world/coastStructures.ts` gantry sizes (no change to Perno's).

### Turku loads faster: the piers' kit made as you come near, the berths and steps by a grid (27 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "The Turku map takes a while to load. Can you make sure it's not doing the same thing as the Firth of Clyde map with all the piers?"

- **Measured** (a CPU profile of the page loading, headless): the world ready 20.8 s after the reload, of which the game's own start-up was 10.4 s. Two parts of it went over all of Turku's 3,276 jetty pieces (the Clyde has 308): making the harbour kit of every pier on the map before the first frame (5.6 s), though a square of it is drawn only within 2.5 km of you; and working out every berth along every pier face (2.6 s, each spot checked against every block and every berth so far), wanted at the start only to put you on the quay. The Clyde's old trouble (laying out its cargo, fixed by the main game chat on 24 Oct) is fine here: 0.7 s.
- **The harbour kit square by square** (`world/view/worldView.ts` `CoastKit`; `coastView.ts` `addStructure`): a coast region's lighthouses and landmarks are made at once; its 1 km squares (`coastStructureCell`) as the viewer comes within `coastStructureDistance` and a square more of them, nearest first, piece by piece, `coastKitMs` (4) ms a frame, each merged when whole; those round the start before the first frame. A square never visited is never made (memory saved too). Drawing only: the piers are solid and walkable from the start, as before. Arriving somewhere by the Voyage tab's Go, its piers may draw in over a second or two.
- **Berths by a grid** (`world/berths.ts` `generate`): each spot is checked against the blocks and berths near it (`GridIndex`), not every one on the map; the same berths, in the same order, with the same ids (checked on all six worlds, career included: identical).
- **The piers' drawing steps by a grid** (`world/blockSteps.ts`): the same greedy colouring, each block against the earlier blocks near it: Turku's 779 ms to 60 ms, identical on every map.
- **Now:** the game's own start-up 2.6 s (from 10.4), the world ready 11.9 s after the reload in the headless browser (from 20.8; the rest is the browser loading the code, the 2.6 MB map file and the shaders, and waiting on the downloads). The Clyde in the same setup: 9.6 s, its start-up 2.7 s. What's left of the game's own: about 0.7 s laying out the crane cargo (`cargo.ts`, the main game's: each crane item against all the cargo), told to the main game chat rather than changed here.
- **Tests:** `tests/coastLoad.test.ts` (the drawing steps by the grid against every pair, on every coast map; Turku's under a quarter of a second). `npm run test:map`, the typecheck and all of `npm test` pass. Headless: the start harbour complete at the first frame; off Nagu the 24 squares round it made as she came.
- **Not checked:** on the Quest (how long it really loads there, and whether making a square ever shows as a stutter).
- **Shared changes:** `src/world/view/worldView.ts` (the coast kit square by square; `structureParts` takes the steps), `src/world/berths.ts` and `src/world/blockSteps.ts` (by a grid, the same results). Setting `CONFIG.regions.coastKitMs`.

### Turku: the yard's ships 20 decks high, five in the hull (27 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "still looks too high. The Icon class is 20 decks high approximately, but ... five of those decks are in the hull."

- **Her height by decks** (`CONFIG.structures.yardShip`): `hullDecks` 5 of `deck` 3 m from her keel to her main deck (15 m, from 6.5 % of her length, 19.5 m on the 300 m ship), and `decks` 15 on top (from 16): 20 in all, 60 m from her keel. Afloat at 8.5 m, her main deck is 6.5 m over the water and her top deck about 51 m (from 59), the funnel over it.
- **Her hull's paint:** the blue band is `band` 0.7 of her freeboard, a strip of white above it (it was 8 m of blue, more than the freeboard has now).
- Both ships take it. **Tests** (`coastTurku.test.ts`: 20 decks, 5 in the hull), `npm run test:map` and the typecheck pass. Seen in the game headless.
- **Not checked:** on the Quest.

### Turku: the yard's ships wider, their superstructure running nearly to the bow (27 Oct 2026)

**Owner approved; merged into `next`.**

Owner, from a picture of the finished ship: "it's way too narrow, and the superstructure starts way too far back. Take a look at pictures of Icon of the Seas or Legend of the Seas for inspiration."

- **From the Icon class** (365 m, about 48 m at the waterline, much wider over the superstructure; the bridge front about a tenth of her length from the stem), as proportions, not a copy:
  - **Wider:** her beam 14.5 % of her length (`T.yardBeam`, from 14 %: 48 m on the dock ship, 44 m on the finished one); above her lifeboats her decks overhang the hull, `superWidth` 1.2 times its width from the `overhangFrom` (3rd) deck up, narrowing with the bow under them; the lifeboats sit under the overhang, and the bridge wings reach out past it.
  - **Further forward:** the superstructure to `fore` 0.9 of her length (from 0.78), from `aft` 0.04 (from 0.06), over a fuller bow (`bowLength` 0.2, `bowFullness` 2.2, from 0.22 and 1.7). Its front stays upright (0.6 m a deck) and faceted.
- Both ships take it (the dock ship's blocks too). Settings in `CONFIG.structures.yardShip`.
- **Tests** pass (`coastTurku.test.ts`, `npm run test:map`, the typecheck). Seen in the game headless from her bow quarter and abeam.
- **Not checked:** on the Quest.

### Turku: the finished ship back, her front less raked and rounded in three facets (27 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "the original cruise ship you had, the completed one, maybe was a better basis ... The forward slopey part was too sloped ... less sloped. And usually the front of the cruise ships are curved, but you could use kind of three facets to keep it simple ... go back to that model."

- **Back to the original finished ship** at the outfitting pier (`turku.yaml`: 300 m, `stage` 0.88, her own block pattern): navy band at the waterline under a white hull, white decks with their window bands, lifeboats, bridge and wings, funnel and water-park.
- **Her front less raked:** `CONFIG.structures.yardShip.rake` 1.4 to 0.6 m a deck (about 10 m over her 16 decks, from 22). The dock ship's front takes it too.
- **Her front rounded in three facets** (`coastStructures.ts` `front3`): each deck's front block ends in a flat middle face across the middle third of her, and an angled face each side swept back `frontFacet` (0.2) of her beam to her side.
- **Kept from the last change set:** the request's `painted` and `seed` options (`common.ts`, `package.ts`, `YardShipDef.painted`) stay, unused for now.
- **Tests** (`coastTurku.test.ts`): the dock ship unpainted in the drained dock; the finished one at the pier; her front setting back under 10 m over all her decks; over 60 m to her funnel; both ships under 8,000 triangles. `npm run test:map` and the typecheck pass. Seen in the game headless from her bow quarter: the upright faceted front over the long foredeck.
- **Not checked:** on the Quest.

### Fix: grey slopes over narrow sounds (the far-hills change) (27 Oct 2026)

**Owner approved; merged into `next`.**

Owner, near Naantali in Turku: "There are some grey geometry near Naantali (NW) but I can drive through them."

- **Cause** (mine, from the review fixes of 24 Oct, "Far hills merged less"): to merge the far hills' mesh less often, chunks now drawn nearer (in full or coarse) were left in the far mesh until it was next tidied, and a merge took in a band of chunks just inside the coarse ring. The far mesh is a 270 m grid: across a narrow sound (Naantalinsalmi) it lies as sloping ground over the water, standing above the nearer mesh, and only drawn, so you sail through it. At speed you outran the tidying.
- **Fix** (`coastView.ts`): a chunk drawn nearer is never in the far mesh as well. It leaves within `coastFarRebuild` (0.5 s), as before the change. The safe parts of the saving stay: the fog's reach in 500 m steps, the coarse ring's 300 m hysteresis, the sort only after 50 m, one merge taking in the chunks just beyond the fog (`coastFarAhead`, now beyond the fog only), and chunks gone into the fog tidied later (`coastFarSlack`, `coastFarTidy`). On the 30 km Clyde run: 77 merges (166 before the change; the 14 it had came from the fault).
- **Tests** (`coastViewBudget.test.ts`): after the run, no chunk drawn nearer is in the far mesh (the faulty version fails it, with nine), and under 100 merges. `npm run test:map` and the typecheck pass. Seen in the game: brought up Naantalinsalmi at speed on 298 degrees, to the owner's spot; open water ahead, the shores where they are.
- **Note:** the fault is on `next` and in the live game (it went with the review fixes).

### Turku: the finished ship as the dock ship's shape, white and blue; the yard's name on the gantries (27 Oct 2026)

**Owner approved; merged into `next`.**

Owner: "the docks [are] usually drained during the build. I don't like the completed cruise ship. You can actually make it look like the same shape as the ones in the dock, but just a nice white paint and a blue coloured hull. And I'd like the text Meyer Turku to be on the gantry cranes."

- **The dock:** drained during the build, as it was drawn; unchanged.
- **The ship at the outfitting pier** (`coastStructures.ts` `yardShipParts`; owner, after two tries: "Just do the same shape but with fresh paint, lifeboats and windows"): exactly the dock ship's shape (the same length 330 m, beam, stage and block pattern: the request's new `seed`, both 1), so the same blocks and the same ragged top, but `painted`: white decks with their window bands over a blue hull (`colours.hull` 0x1f3f8a), red below the waterline, her orange lifeboats along her sides where her decks are built up to them. (A first try kept the even wedge of decks and took off the windows, lifeboats, funnel, slides and bridge, which the owner hadn't asked for.) A ship at `stage` 0.8 or more still gets every deck, her bridge, funnel and water-park.
- **The yard's name on the gantries:** "MEYER TURKU" in block capitals along both faces of each girder, white on the blue, a little to one side of the middle. The wording comes from the map's request (`turku.yaml` `gantrySign`; `common.ts`, `package.ts`, `GantryDef.sign`), not the code. Letters are drawn as flat strokes on a 4 by 6 grid (`STROKES`: the letters needed so far, A E K M N O R T U Y; anything else is a space), two triangles a stroke, in the one landmark mesh. `CONFIG.structures.gantry.signHeight` 6.5 m, `colours.sign`. Note for later: it's the yard's real name and trademark, written plainly (no logo); worth remembering if the game is ever published commercially.
- **Tests** (`coastTurku.test.ts`): the gantries with their signs still under 2,000 triangles; the painted ship the dock ship's length, beam, stage and pattern, her parts the dock ship's plus her lifeboats; the ships under 8,000 triangles together. `npm run test:map` and the typecheck pass. Seen in the game headless: the sign reads along the girder; the finished ship white over blue at the pier.
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
- **Far hills merged less** (`coastView.ts`). A big map merged its far chunks into one mesh again, and sent it to the graphics chip, each time a chunk crossed a line or the visibility drifted, up to twice a second. Now: the fog's reach is rounded up to 500 m steps (`coastFogStep`); a chunk keeps its coarse copy 300 m past its line (`coastHysteresis`); the chunks are re-sorted by distance only after 50 m of movement (`coastResort`); a merge only happens when a chunk must join (a hole otherwise), and then it takes in the chunks within 2 km of needing it too (`coastFarAhead`: the next row about to leave the coarse ring, the hills just beyond the fog), so one merge serves a whole row; chunks no longer needed stay in the mesh, under the nearer ground or in the fog, until they're over a quarter of it (`coastFarSlack`, at most every `coastFarTidy` 5 s). On a 30 km run down the Clyde in wandering visibility: 14 merges, down from 166 for the same run merging chunk by chunk. (Corrected 27 Oct: leaving chunks under the nearer ground stood grey slopes over narrow sounds; see the fix above.)
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


