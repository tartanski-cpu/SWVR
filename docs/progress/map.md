# Progress: The map

The running record for this area's chat: the coast pipeline, coast regions and Voyage maps. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `tools/coast/`, `coast.html`, `public/regions/`, `src/world/regions/`, `src/world/coast*.ts`, `src/world/maps.ts`, `src/world/view/coastView.ts`, `docs/COAST_PIPELINE.md`, `docs/REGIONS.md`; settings in `src/config/map.ts`.
- **Its tests while working:** `npm run test:map`. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/map/ (branch `preview/map`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

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


