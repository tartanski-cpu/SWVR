# Progress: The main game

The running record for this area's chat: the landing page, Career and Voyage gameplay, multiplayer, the app shell and menus. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/app/`, `src/ui/`, `src/career/`, `src/voyage/`, the gameplay folders (`rescue/`, `tow/`, `fire/`, `fishing/`, `salvage/`, `cargo/`, `duties/`, `traffic/`, `wildlife/`, `potting/`, `fuel/`, `board/`), `src/player/`, `src/controls/`, `src/environment/`, `src/ocean/`, `src/nav/`, `src/chart/`, `src/net/`, `src/audio/`, `src/render/`, `src/main.ts`, `src/mode.ts`, `index.html`, `career.html`, `voyage.html`; settings in `src/config.ts`.
- **Its tests while working:** `npm test` (all of it). Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/next/ (branch `next`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

### The code organised by area, so the chats can work side by side (owner request, 23 Oct 2026)

Owner: "Is there a better way to organise the code so that the main game, the shipyard, the modules, and the map are independent from each other, and that I can have agents working on each one separately, and they're not having to merge and test across everything?"

One repository still (the Shipyard builds the boats the game sails, the map feeds the game: separate repositories would have to be kept in step by hand). What made the chats wait was what they all shared:

- **The settings file:** `src/config.ts` (5,800 lines) is split. The main game's settings stay in it; the Shipyard's are in `src/config/shipyard.ts`, the modules' in `src/config/modules.ts`, the map's (regions, currents, nav, trees, skyline, places, shore, surf) in `src/config/map.ts`, and the vessels' layouts in `src/config/vessels.ts`. `config.ts` joins them into the same `CONFIG`, so no code that reads it changed. `BODY_RADIUS` and the towable hulls' masses moved with the vessels (`BODY_RADIUS` is still exported from `config.ts`).
- **The progress log:** each area has its own, `docs/progress/<area>.md`. `PROGRESS.md` keeps the shared decisions, the roadmap and the history to date.
- **One address to try things:** each area chat gets its own, https://tartanski-cpu.github.io/SWVR/preview/<area>/ from the branch `preview/<area>`, built with the rest when any of them is pushed (`.github/workflows/pages.yml`, woken by `next.yml`). Its name shows in the menu header and the tab (`VITE_CHANNEL`, `vite.config.ts`, `src/main.ts`). Previews are built but not tested in the publishing run, so one area's tests don't hold up another's publish; `.github/workflows/check.yml` tests every push to a preview branch.
- **Testing one area:** `npm run test:shipyard`, `test:modules`, `test:map`.
- **The rules:** CLAUDE.md, "Working in areas": which files each area owns, what's shared and how to change it, where to log, how a milestone moves from a preview to `next` and on to the game.

**Shared changes:** all of the above (the config split touches every area's settings).

Checked: typecheck, all tests, the build. Not yet checked: the preview addresses. The publishing workflow runs from the game's branch, so they work only once `pages.yml` is on it (the owner's go-ahead).

