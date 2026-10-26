# CLAUDE.md

Standing instructions for every Claude Code session on SWVR. Read this first, then `PROGRESS.md` and your area's log in `docs/progress/` (see "Working in areas").

## The project

SWVR (players see it as **Workboat World**; v1.0 is tagged) is a browser WebXR sea rescue and operations game: chunky low-poly workboats you operate from the inside, with physical controls. It is played on a Meta Quest 3 (90 Hz target) and on desktop, solo or in peer-to-peer multiplayer.

- TypeScript, Vite, Three.js. The only runtime dependencies are `three` and `peerjs`.
- Live at https://tartanski-cpu.github.io/SWVR/. The repo, URL, save keys (`swvr.*`) and multiplayer room ids (`swvr-room-*`) keep the old name on purpose: renaming them would lose players' saves and split multiplayer between versions. Every push to the dev branch deploys it.
- **The owner is a naval architect and doesn't write code.** Naval-architecture terms are welcome. Explain everything else in plain words. The owner tests in VR on the Quest 3 and on desktop.

## Standing rules (agreed with the owner)

- **Ask first** before adding a dependency over ~100 KB, or any paid service.
- **Clarity over cleverness.** Comment the physics: say what is modelled and why. Tunable numbers go in `src/config.ts`, with a comment, not inline.
- **Flag technically unwise requests** and say why, rather than building them silently.
- **Keep it cheap on the Quest.** Watch draw calls: merge static parts, instance repeated ones, hide small detail from afar. No new physics bodies, ropes or particle systems unless the owner has agreed to them.
- **Original designs only.** Boats, gear and places are designed for the game, not copied from real products or commercial designs.
- **After each change set:**
  - give the owner **VR and desktop test steps**;
  - update **your area's log**, `docs/progress/<area>.md` (what changed and why, with the config keys; see "Working in areas");
  - update **`README.md`** where players would notice.
- **Verify before reporting.** Run `npm run typecheck` and `npm test`. For anything visible, also run the game in headless Chromium and look at screenshots. Say plainly what was and wasn't checked.

## Git and deploy

- Work on the branch the session names; the long-running dev branch is `claude/admiring-dirac-v9wwih`. Push with `git push -u origin <branch>`. **Don't open pull requests** unless the owner asks.
- Leave no untracked files behind. Scratch scripts and screenshots go in the session's scratchpad, not the repo.
- **Never put a model name or id** in commits, code or docs.
- **Tag `V1.0`** (capital V, made by the owner on GitHub) marks Workboat World v1.0, the owner's restore point before modular boats. Sessions can't push tags; fixes after it go on the dev branch, and the owner tags them (e.g. `V1.0.1`). Never move or delete a release tag; see PROGRESS.md "Release: Workboat World v1.0".
- **Two addresses, one site** (`.github/workflows/pages.yml`, rebuilt on a push to either branch):
  - the game at https://tartanski-cpu.github.io/SWVR/ from the dev branch;
  - work in progress at https://tartanski-cpu.github.io/SWVR/next/ from the branch **`next`**. Its menu header and tab say NEXT. A push to `next` wakes the publishing workflow through `next.yml`, because only the dev branch may deploy the site.
- Put a milestone on `next` first (`git push origin HEAD:next`) for the owner to try. Move it to the dev branch when the owner says it's good.
- The workflow runs `npm test` and `npm run build` for both branches. A failing game build publishes nothing; a failing `next` build leaves a notice at /next/. After a push, check the run succeeded before telling the owner it's live.
- **Both addresses share one browser storage** (same site), so they share career saves and settings. Before `next` changes a save format, give it its own save keys, or a test there could spoil the owner's real career.

## Working in areas (one chat per area, Oct 2026)

The owner runs a separate chat for each area, so their agents can work side by side without waiting on each other:

| Area | Its files | Its settings | Its log | Its address (branch) |
|---|---|---|---|---|
| **Main game**: landing page, Career, Voyage gameplay, multiplayer | `src/app/`, `src/ui/`, `src/career/`, `src/voyage/`, the gameplay folders, `src/player/`, `src/controls/`, `src/environment/`, `src/ocean/`, `src/nav/`, `src/chart/`, `src/net/`, `src/audio/`, `src/render/`, `src/main.ts`, the game pages | `src/config.ts` | `docs/progress/game.md` | /SWVR/next/ (`next`) |
| **Shipyard** | `src/shipyard/`, `shipyard.html` | `src/config/shipyard.ts` | `docs/progress/shipyard.md` | /SWVR/preview/shipyard/ (`preview/shipyard`) |
| **Modular builder**: new modules | `src/modules/`, `src/modular/`, `src/mechanisms/` | `src/config/modules.ts` | `docs/progress/modules.md` | /SWVR/preview/modules/ (`preview/modules`) |
| **Map** | `tools/coast/`, `coast.html`, `public/regions/`, `src/world/regions/`, `src/world/coast*.ts`, `src/world/maps.ts`, `src/world/view/coastView.ts` | `src/config/map.ts` | `docs/progress/map.md` | /SWVR/preview/map/ (`preview/map`) |
| **Hull modifications** | `src/hulls/`, `hulls.html` | none | `docs/progress/hulls.md` | /SWVR/preview/hulls/ (`preview/hulls`) |

- **Stay in your area's files.** Everything else is **shared**: `src/core/`, `src/vessel/`, `src/boats/`, the rest of `src/world/`, `src/config/vessels.ts`, `package.json`, the workflows, `CLAUDE.md`, `PROGRESS.md`, `README.md`. Change a shared file only when your work needs it, keep that change small, and say so in your log under a **Shared changes** line, so the other chats know what moved under them. A bigger change to shared code (the simulation, vessel physics, multiplayer) is the main game chat's, or the owner's call.
- **Your settings go in your area's settings file.** `src/config.ts` joins them all into one `CONFIG`, read as ever (`CONFIG.shipyard...`).
- **Your log, not PROGRESS.md.** Write each change set at the top of your area's `docs/progress/<area>.md`. `PROGRESS.md` keeps the shared decisions, the roadmap and the history up to 23 Oct 2026; update it only for a decision that affects every area.
- **Your own preview address.** An area chat (not the main game) pushes its milestones to `preview/<area>` (`git push origin HEAD:preview/<area>`; the branch is made on the first push). It's published at https://tartanski-cpu.github.io/SWVR/preview/<area>/, with the area's name in the menu header and the tab. Tests run on every push to a preview branch (`.github/workflows/check.yml`); check that run, then the address's `build.json`, before telling the owner it's live. The main game chat keeps using `next`.
- **While working, run your area's tests** (`npm run test:shipyard`, `test:modules`, `test:map`; the hull study: typecheck, then `test:shipyard`) and the typecheck. Before work moves on, run all of `npm test`.
- **Keep up with `next`:** merge `origin/next` into your branch at the start of each change set. With each area in its own files it merges cleanly; a conflict means a shared file, so look at what the other chat did before settling it.
- **When the owner says an area's milestone is good,** merge it into `next` (merge `origin/next` in first, run all of `npm test`, push to `next`), and it goes on to the game from there as before.
- **All addresses share one browser storage** (same site): career saves and settings are shared with the game, as for `next` (see below).

## Commands

```
npm install
npm run dev         # HTTPS dev server (self-signed; the Quest can join over the LAN)
npm run typecheck
npm test            # vitest, all tests
npm run test:shipyard / test:modules / test:map   # one area's tests (see "Working in areas")
npm run trials      # sea-trials report (speed, turning, stopping)
npm run crewcheck   # two-browser multiplayer check (needs npm run dev running): join, crew list, launch, tow, leave
npm run build
```

Headless browser checks: Chromium is pre-installed for Playwright. Launch it with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` and ignore HTTPS errors. `https://localhost:5173/` is the landing page (career / voyage / training); the game pages are `career.html` (the career game, with all the `?design=` / `?game=` parameters) and `voyage.html?map=<id>` (a coast map on its own, `src/mode.ts`, `src/world/maps.ts`). The app is exposed as `window.app` for scripting.

## How the code is organised

- **Simulation is separate from drawing.** The world is plain JSON (`WorldState`, `src/core/`), advanced on a fixed tick by `stepWorld`. The host is authoritative: players send *intents* (`{playerId, targetId, control, value, …}`), and crew receive snapshots. Simulation code never touches Three.js scenes or the DOM. Views (`*/view/`, `src/render/`) read state and draw it.
- `src/config.ts`: every tunable, as one `CONFIG`. The main game's are in it; each area's are in its own file in `src/config/` (`shipyard.ts`, `modules.ts`, `map.ts`, and `vessels.ts`, each vessel's layout: `vessels.workboat`, `vessels.skiff`), joined into `CONFIG` there.
- `src/vessel/`: vessel definitions, hydrostatics and hydrodynamics, engine, layout and walk areas, tender crane.
- `src/controls/`: interactive controls (the `Control` base class: levers, toggles, buttons, wheel, tiller). Each boat's modules and controls are put together from her recipe by her boat view (`src/app/boatView.ts`).
- `src/app/`: the app shell (`App.ts` and the pieces split out of it: each boat's view, career session, laser pointer, sound board, desktop pointer, XR session).
- Gameplay systems each have a folder: `rescue/`, `tow/`, `fire/`, `fishing/`, `salvage/`, `cargo/`, `career/`, `duties/`, `traffic/`, `wildlife/`, `environment/`, `ocean/`, `world/`, `nav/`, `chart/`, `net/` (multiplayer), `audio/`, `ui/`.
- `tests/`: vitest tests, mostly against the plain-JSON simulation.
- `src/shipyard/` + `shipyard.html`: the Shipyard (design a boat, get her 10-character code; `?design=CODE` starts the game in her). `design.ts` the choices and code, `build.ts` design to hull + recipe (worked out part by part in `parts/`: hull, house, engine room, deck gear, places, recipe, weights), `trial.ts` gearbox matching, `page.ts` the page.
- `tools/coast/` + `coast.html`: the coast pipeline (offline: real coastline regions from open data, its own tools) and its viewer; its product goes to `public/regions/<id>/` (the mesh) and `src/world/regions/<id>.coast.json` (the game's region data). In the game a coast region is `src/world/coastRegion.ts` + `coastTerrain.ts` (its ground) + `world/view/coastView.ts` (its drawing); the coast maps are Voyage mode's (`voyage.html?map=<id>`, `src/world/maps.ts`), never in the career world. See `docs/COAST_PIPELINE.md`.
- `src/hulls/` + `hulls.html`: the hull study (lines-plan hull generator, type designs, viewer). Separate from the game; groundwork for modular boats.

## Docs

- `PROGRESS.md`: the shared decisions, the roadmap and known issues, and every change set up to 23 Oct 2026. **The source of truth for where things stand**, with the areas' logs since then.
- `docs/progress/<area>.md`: each area's change sets from 23 Oct 2026 (game, shipyard, modules, map, hulls).
- `README.md`: for players. Controls, features, how to play.
- `docs/MULTIPLAYER.md`, `docs/TESTING_NEW_BOATS.md`: topic guides.
- `ideas.md`: the owner's feature ideas list. It may lag behind; `PROGRESS.md` wins.
- **Release notes** (owner, 26 Oct 2026: "release notes like this form from now on"): a published page in the form of https://claude.ai/artifact/88WruzhXWjxsseUUCnEehX (Wreck ROV's): a masthead with play links, an "at a glance" grid, a dated log of entries (a rail with the part of the work, its days and its trade; a heading, a short summary, bullets, captioned development screenshots), then Try it, Known limits and Coming next. The latest is https://claude.ai/artifact/KrMAcPXRf47XEgd87APdnC. Keep the same notes as text in `docs/RELEASE_NOTES_<date>.md`.

## Direction (see PROGRESS.md, "Direction: one engine, three games")

- **Next big step: modular boats, built in this game.** The owner will bring a detailed plan in its own prompt. Don't design or start it ahead of that.
- **Regions (growing the world), under way** on the owner's brief: see `docs/REGIONS.md` and PROGRESS.md "Regions". A region is a data file in `src/world/regions/`, never code of its own. A real-coast map models every harbour in the map data, never just three like the hand-built regions.
- **Later, only when the owner asks:**
  - a mobile touchscreen driving version;
  - a procedural free-sail world.

  Both are to share this repository's core, not be separate projects or long-lived branches. Keep new simulation code free of VR- and desktop-specific assumptions where that's no extra effort, so the split stays easy.
