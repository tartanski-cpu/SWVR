# Progress: The main game

The running record for this area's chat: the landing page, Career and Voyage gameplay, multiplayer, the app shell and menus. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/app/`, `src/ui/`, `src/career/`, `src/voyage/`, the gameplay folders (`rescue/`, `tow/`, `fire/`, `fishing/`, `salvage/`, `cargo/`, `duties/`, `traffic/`, `wildlife/`, `potting/`, `fuel/`, `board/`), `src/player/`, `src/controls/`, `src/environment/`, `src/ocean/`, `src/nav/`, `src/chart/`, `src/net/`, `src/audio/`, `src/render/`, `src/main.ts`, `src/mode.ts`, `index.html`, `career.html`, `voyage.html`; settings in `src/config.ts`.
- **Its tests while working:** `npm test` (all of it). Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/next/ (branch `next`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

### Everything on next goes to the live game (owner: "approved", 23 Oct 2026)

- The test build as of the afternoon of 23 October, every chat's approved work on `next`, merged into the dev branch: https://tartanski-cpu.github.io/SWVR/.
- The release note by theme is `docs/RELEASE_NOTES_2026-10-23.md`, and the README's status line points to it.

### Live weather on the Voyage maps, applied (owner request via the map chat, 23 Oct 2026)

The owner asked the map chat for "real-time weather in those locations ... every time you start a game session". The map side, the fetch (`src/world/coastWeather.ts`, Open-Meteo: free, no key) and each map's `weatherAt`, came over from `preview/map` onto `next` at the owner's go-ahead. This is the game side.

- **At the start of a Voyage** (alone or hosting, once a page; crew get the host's through the snapshots): `fetchLiveWeather(voyageMap(id).weatherAt)` (`App.startLiveWeather`).
- **Applied:** `setLiveWeather` (`environment/weather.ts`) puts the wind, its direction, visibility, rain and cloud in at once, with the nearest preset, held for the session (`fixed`: no director).
  - The sea is at the marine model's height where it gave one (`WeatherState.seaHeld`, the sea scale), and stays there instead of following the wind, which would drag it back to the wind's sea in minutes. With no marine sea, it's the sea the wind raises.
  - A debug preset gives the game's own weather back.
- **Told:** a notice as it comes in, "Live weather, Oban and Lorn 15:45 GMT+1: wind north-west 10 kn, gusts 18, overcast, sea 0.5 m" (`voyage/liveWeather.ts`), kept as `WeatherState.live` so crew see it too.
  - The Voyage tab has it under the weather lines, with Open-Meteo's credit. The weather line says "live, held" in place of the next change.
  - The credit is also with the map credits at the menu's foot, as Open-Meteo's terms ask.
- **Nothing back within 8 s** (offline, the service down): no change, the game's own weather as before.
- **The game's first call to an outside service** (free, no key), made by the players' browsers as a Voyage starts.
- Tests: `tests/liveWeatherApplied.test.ts`: held for ten minutes of sim with the sea at the marine height, not the wind's; no marine sea gives the wind's; a debug preset releases it; the words.
- Checked in headless Chromium: the page asked Open-Meteo for Oban. The answers were Open-Meteo's real ones, fetched from the command line, since this sandbox's headless browser can't reach the service itself; Open-Meteo allows any site to call it. The game came up overcast, wind 5.3 m/s from 328°, sea 0.5 m held, with the notice (screenshot). Not checked: VR; a real browser's own fetch.

**Shared changes:**
- `src/environment/weather.ts`: `setLiveWeather`, `seaHeld`, `live`.
- `src/ui/mainMenu.ts`: the two Voyage rows and the credit.

### The timber run: back into VR on the way back (owner request, 23 Oct 2026)

- `src/app/xrSession.ts`: on `sessiongranted` (the browser handing a VR session across from the page before: WebXR navigation), the Enter VR button presses itself after `CONFIG.xr.grantedEnterDelayMs` (600 ms), if not already in VR. three's `VRButton` did that only when the event came before the button was made. The wait keeps the two from both pressing it, as a second press would end the session.
- Where the browser has no WebXR navigation, it's unchanged. three's button uses `offerSession` where the browser has it, so the Quest browser offers "Enter VR" in its own interface, one tap.
- The contract (`docs/metaverse-contract.md`) now asks the same of both games: don't end VR before navigating.
- The Timber chat has its brief: sections 2 and 4 of the spec, the owner's no-prompt change, the VR notes and the test links page.
- Checked: typecheck, tests. Not checked: VR. Headless Chromium has no headset, and WebXR navigation needs one.

### The timber run: ashore without a prompt (owner request, 23 Oct 2026)

Owner: "I want the transition to be seamless. So if you anchor there in VR or in desktop, it should load into the Timber game. Whether you want it to or not." The rest of the message was cut off; taken as "no prompt".

- Anchoring in the bay now takes you straight ashore (`HotspotWatch`): the anchor let go and set inside the radius, her under 0.5 kn, for 3 s. Then the fade, and the page goes to Timber. Gone: the prompt, Not now, Enter to go, and the Voyage tab's Go ashore button. Enter and the Voyage tab still sell at the merchant.
- **No bounce-back:** an anchor already set as the page loads (back from the camp, she lies anchored in the bay) doesn't send her straight back. It counts once she's been seen not anchored there: weighed, or outside the radius.
- **In VR,** the session is no longer ended before the page goes. A browser that can carry VR across pages (WebXR navigation, `sessiongranted` on the next page) keeps you in it. The Quest browser doesn't do that by default as far as I know, so there you drop out of the headset view and press Enter VR on Timber's page. Truly seamless in VR needs both games in one page (the spec's stage 3), or Timber listening for `sessiongranted` where the browser offers it.
- Still only when playing alone or hosting with nobody aboard: anchoring there with crew aboard does nothing (it would take the host away from their crew).
- This is the one place the shared contract's Workboat section is changed by the owner: its "no handoff without the explicit confirm" no longer holds.
- Test: `tests/metaverse.test.ts`: goes on anchoring; not on an anchor already set at load; goes after weighing and letting go again; not with crew, moving or outside. Checked in headless Chromium: the anchor let go in the bay, the page went to Timber by itself once it set; back with no barge, she lay anchored and didn't go again.

### The timber run: Workboat World × Timber handoff (owner's spec, 23 Oct 2026)

The owner's spec: in Voyage, anchoring in a marked bay hands the player to the Timber game. Delivering logs there spawns a barge, and coming back to the boat brings it as towed cargo to sell. The loop repeats. The two games stay separate apps and only meet through the address (`docs/metaverse-contract.md`, the shared contract, filled in for the first site).

- **The contract** (`src/voyage/metaverse.ts`): the envelope (`mv`, base64url of its JSON) built, read and checked.
  - Handoff ids are issued on the way out and consumed once on the way back (`swvr.mv.issued` / `swvr.mv.consumed`).
  - The site registry: `loch-timber-1`, Ardantrive, Kerrera. Its beach and barge spawn were picked from the Oban map's ground; the Timber URL is https://tartanski-cpu.github.io/BigTImberVR/.
  - Real lat/lon to the map's metres by the coast pipeline's own projection (the map's request box and its region's offset, `MAP_GEO`). A test checks both against the pipeline's request and the region file.
- **The hotspot** (`voyage/timber.ts HotspotWatch`): anchor set, under 0.5 kn, inside the 60 m radius, held 3 s, then the prompt. Not now holds until she leaves the radius. Nothing happens without Go.
  - Desktop: Enter (`KEYS.timber`) and a line above the helm prompt.
  - VR: the Voyage tab's **Timber** row, plus a notice on the wrist.
  - Offered only when playing alone, or hosting with nobody else aboard.
- **Out:** the voyage is saved (now with her anchor: `VoyagePlace.anchor`, where it lies and the chain out, so she's back at anchor, not adrift). An id is issued, the envelope is built with the return address (one-off parameters like `start` removed), the screen fades over 1 s (`fadeS`), XR is ended, and the page goes to Timber.
- **Back:** the envelope is taken off the address before anything else is placed, then her place is restored. With `barge_ready`, a log barge is spawned at the site's spawn point (or `bargeOffM` toward it from the boat if the spawn is out of the line's reach) and made fast on her towline (`tow.ts makeFastNow`). Then the screen fades in.
- **The log barge:** the towable work barge (9 m), with `world.timber.barges[id].logs`. The logs are drawn as one instanced mesh, 10 to a tier (`timberView.ts`), and weigh on her as payload (`logKg` 170 each, `cargo.ts payloadOf`): a full 40 is 6.8 t more on her 10.5 t, about 0.25 m deeper (Timber's barge is full at 20; logs delivered after that travel too, up to 40 here; more is capped, as she'd sink). Towed, cast off and made fast like any tow. The barges are saved with the voyage (`swvr.voyage.barges.<map>`), the towed one on the line again.
- **The sale:** `CONFIG.voyage.timber.merchants`, the Oban timber merchant at the North Pier berth. With the barge within `sellRangeM` (15 m) of its quay and the boat under `sellMaxSpeedKn`, the sale is offered: logs × `pricePerLog` (£12; Timber's full barge of 20, £240). Sold, the barge is gone and the money is in the account. Voyage now keeps its account (`swvr.voyage.money`).
- **On the chart:** the camp's anchorage (a dashed ring and an anchor) and the merchant (a square), via `ChartPlotter.specials`. In the world: a yellow buoy with a brown band in the bay.
- Config: `CONFIG.voyage.timber` (`holdS`, `maxSpeedKn`, `keepIds`, `fadeS`, `maxLogs`, `logsPerTier`, `logKg`, `logLength`, `logDiameter`, `bargeOffM`, `merchants`, `pricePerLog`, `sellRangeM`, `sellMaxSpeedKn`, `bargeHalfLengthM`).
- Tests: `tests/metaverse.test.ts`:
  - the envelope round trip and malformed input;
  - the address stripped;
  - ids consumed once;
  - the geography against the pipeline;
  - the hotspot and the spawn in water on the real ground;
  - the prompt's rules;
  - the barge back on the line, weighted, and sold;
  - the save and restore.
  
  Also `tests/voyagePlace.test.ts` (anchored: saved, set again, still holding a minute on).
- Checked in headless Chromium:
  - anchored in the bay, the prompt came up and Enter went to the Timber address with the right envelope;
  - coming back with `barge_ready` and 20 logs, she's at anchor where she was, with the barge on the line (screenshot);
  - a refresh made no second barge;
  - at Oban's quay the sale was offered and Enter paid £240, saved;
  - the camp shows on the chartplotter.

  Not checked: in VR; the real Timber game's side.
- Not done, as the spec leaves out of v1: multiplayer handoff, barge damage, logs lost in weather. Also not done: a world-space sign or physical control in VR for the prompt (the spec's "physical control or gaze-and-pinch"); VR uses the menu's Timber row for now.

- **The handoff's test links:** `tools/mv-encode.html` (built with the site, at /SWVR/tools/mv-encode.html). It makes an outbound link to Timber, a return link to Workboat World (issuing the id in this browser first, so the return counts once), and reads any envelope. Checked in headless Chromium: a return of 25 logs made the barge; the same link again made nothing more; a return with no barge made nothing; garbage read as not an envelope.
- **Logs beyond Timber's 20:** Timber's spec lets logs delivered after the barge fills travel too. A barge here carries up to 40 (four tiers; `maxLogs`); an edited address with more is capped at 40, as a barge with hundreds aboard would sink. (The spec accepts 999 spawning 999 in v1. Capping is the one place this side differs.)

**Shared changes:**
- `src/core/world.ts`: `WorldState.timber`.
- `src/cargo/cargo.ts`: `payloadOf` adds the logs.
- `src/tow/tow.ts`: `makeFastNow`.
- `src/career/career.ts`: `post` exported.
- `src/nav/chartPlotter.ts`: `specials`.
- `src/ui/helmPrompt.ts`: its height from the bottom.
- `src/core/keybindings.ts`: `timber` on Enter.

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

