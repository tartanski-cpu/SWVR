# Progress: The map

The running record for this area's chat: the coast pipeline, coast regions and Voyage maps. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `tools/coast/`, `coast.html`, `public/regions/`, `src/world/regions/`, `src/world/coast*.ts`, `src/world/maps.ts`, `src/world/view/coastView.ts`, `docs/COAST_PIPELINE.md`, `docs/REGIONS.md`; settings in `src/config/map.ts`.
- **Its tests while working:** `npm run test:map`. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/map/ (branch `preview/map`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

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
- **Not yet in the game:** applying it (the host fetching it as a Voyage starts and setting the weather, holding it for the session) is in the main game's files (`src/environment/`, the Voyage start-up), so it's handed to the main game chat with a brief. Until then nothing changes in play.
- **Checked live** (23 Oct, mid-afternoon): Oban a 4.9 m/s north-westerly, overcast, dry, waves 0.5 m; the Clyde 5.5 m/s from the north-west; Tayvallich 7.8 m/s, a trace of rain; Syros a 3 m/s north-easterly.
- **Settings:** `CONFIG.liveWeather` in `src/config/map.ts`.

**Tests:** `tests/coastWeather.test.ts` (6, no network): the real Oban answer turned into the game's weather; fog, a gale, thunder, rain and a clear day to their presets; no sea where the marine model has none; the sea scale for a wave height; both services asked for the map's point, and null when they fail; every map's point inside its own box. All 1,418 tests pass.

**Checked headless:** Oban from the bay and Dunstaffnage from Ardmucknish Bay at the Quest setting: no canopy in the scene, the near trees standing, the far woods darker green on the ground. **Not checked:** the shimmer itself on the Quest (headless doesn't show it the way the headset does).

**Test steps (VR and desktop):** Voyage → Oban and Lorn. Look across at the wooded hills (Kerrera, Dunstaffnage) while moving your head: trees near you, the far woods flat green on the ground, no patches floating over them and no flicker. The live weather comes once the main game chat has wired it in.


