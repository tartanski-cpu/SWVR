# CLAUDE.md

Standing instructions for every Claude Code session on SWVR. Read this first, then `PROGRESS.md`.

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
  - update **`PROGRESS.md`** (what changed and why, with the config keys);
  - update **`README.md`** where players would notice.
- **Verify before reporting.** Run `npm run typecheck` and `npm test`. For anything visible, also run the game in headless Chromium and look at screenshots. Say plainly what was and wasn't checked.

## Git and deploy

- Work on the branch the session names; the long-running dev branch is `claude/admiring-dirac-v9wwih`. Push with `git push -u origin <branch>`. **Don't open pull requests** unless the owner asks.
- Leave no untracked files behind. Scratch scripts and screenshots go in the session's scratchpad, not the repo.
- **Never put a model name or id** in commits, code or docs.
- **Tag `V1.0`** (capital V, made by the owner on GitHub) marks Workboat World v1.0, the owner's restore point before modular boats. Sessions can't push tags; fixes after it go on the dev branch, and the owner tags them (e.g. `V1.0.1`). Never move or delete a release tag; see PROGRESS.md "Release: Workboat World v1.0".
- The Pages workflow (`.github/workflows/pages.yml`) runs `npm test` and `npm run build` on every push. After a push, check the run succeeded before telling the owner it's live.

## Commands

```
npm install
npm run dev         # HTTPS dev server (self-signed; the Quest can join over the LAN)
npm run typecheck
npm test            # vitest, all tests
npm run trials      # sea-trials report (speed, turning, stopping)
npm run build
```

Headless browser checks: Chromium is pre-installed for Playwright. Launch it with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` against `https://localhost:5173/` and ignore HTTPS errors. The app is exposed as `window.app` for scripting.

## How the code is organised

- **Simulation is separate from drawing.** The world is plain JSON (`WorldState`, `src/core/`), advanced on a fixed tick by `stepWorld`. The host is authoritative: players send *intents* (`{playerId, targetId, control, value, …}`), and crew receive snapshots. Simulation code never touches Three.js scenes or the DOM. Views (`*/view/`, `src/render/`) read state and draw it.
- `src/config.ts`: every tunable, including each vessel's layout (`vessels.workboat`, `vessels.skiff`).
- `src/vessel/`: vessel definitions, hydrostatics and hydrodynamics, engine, layout and walk areas, tender crane.
- `src/controls/`: interactive controls (the `Control` base class: levers, toggles, buttons, wheel) and the bridge that places them.
- `src/app/`: the app shell (`App.ts` and the pieces split out of it: career session, laser pointer, sound board, desktop pointer, XR session).
- Gameplay systems each have a folder: `rescue/`, `tow/`, `fire/`, `fishing/`, `salvage/`, `cargo/`, `career/`, `duties/`, `traffic/`, `wildlife/`, `environment/`, `ocean/`, `world/`, `nav/`, `chart/`, `net/` (multiplayer), `audio/`, `ui/`.
- `tests/`: vitest tests, mostly against the plain-JSON simulation.
- `src/hulls/` + `hulls.html`: the hull study (lines-plan hull generator, type designs, viewer). Separate from the game; groundwork for modular boats.

## Docs

- `PROGRESS.md`: the running record of decisions, milestones and every change set, plus the roadmap and known issues. **The source of truth for where things stand.**
- `README.md`: for players. Controls, features, how to play.
- `docs/MULTIPLAYER.md`, `docs/TESTING_NEW_BOATS.md`: topic guides.
- `ideas.md`: the owner's feature ideas list. It may lag behind; `PROGRESS.md` wins.

## Direction (see PROGRESS.md, "Direction: one engine, three games")

- **Next big step: modular boats, built in this game.** The owner will bring a detailed plan in its own prompt. Don't design or start it ahead of that.
- **Later, only when the owner asks:**
  - a mobile touchscreen driving version;
  - a procedural free-sail world.

  Both are to share this repository's core, not be separate projects or long-lived branches. Keep new simulation code free of VR- and desktop-specific assumptions where that's no extra effort, so the split stays easy.
