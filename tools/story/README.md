# The development story deck

A presentation of how Workboat World was built, for people outside the project: a
full-screen deck with a filterable timeline, the way of working, screenshots, and six
**live 3D views that run the game's own code** (the ocean shader, the hull study's lofting,
the physics step with its buoyancy stations, the modular assembler, the Shipyard's builder,
the fleet).

Published as an artifact: https://claude.ai/artifact/QUszDuRJmkvauBfP3n4Q85 (28 Oct 2026).

Not part of the game: nothing in `src/` imports this folder, it is not in the game's build
or typecheck, and its tests are the game's own (the demos only call the game's modules).

## Files

- `story.ts`: the live demos. `window.Story.mount(kind, host, panel)` draws one demo into a
  host element with its controls in a panel; kinds `ocean`, `hull`, `float`, `fleet`,
  `design`, `explode`. It imports the game as `@game/...` (an alias in `vite.config.ts`).
- `page/index.html`: the deck itself (the slides, the timeline data, the charts, the
  navigation). Written for the artifact publisher: no `<html>`/`<head>`/`<body>` of its own,
  colours as tokens for light and dark, a side gutter for phones. It loads `story.js` from
  beside it.
- `page/img/`: development screenshots, taken in headless Chromium from the game and the
  deck's own demos, as JPEGs.

## Build

```
npx vite build --config tools/story/vite.config.ts
```

writes `tools/story/dist/`: `story.js` (about 2.4 MB, the demos with the game's modules and
three.js) beside `index.html` and `img/`. `dist/` is ignored by git.

To look at it locally, wrap `dist/index.html` in a minimal document (it has no `<html>`
skeleton) and serve `dist/` over HTTP (a module script won't load from `file://`).

## Publish

Publish `dist/index.html` as the artifact's page with `story.js` and `img/*.jpg` as its
supporting files, at the same published paths the page references (`story.js`, `img/...`).
To update the existing deck, publish to its URL above rather than making a new one.

## Updating the story

- New change sets: add entries to the `T` array in `page/index.html` (title, part, era,
  what, why, numbers, a quote) and, when there is one, a new screenshot in `page/img/`.
- The map of the work (the "How the work branched" slide): `LANES` are the streams,
  `G` the milestones with a day in October (`d`, fractional to order a day; before the 20th
  the log's order, from the 20th the commit dates), a `from` for a branch or a feed from
  another stream, `major` for a label at the fitted zoom, `merge` for a live-game merge
  (every stream active since the previous merge runs into it by itself).
- New boats or modules appear in the live views by themselves, since they come from the
  game's own fleet, recipes and hull designs.
- The test count and the commits-a-day chart are typed in; refresh them from `npm test` and
  `git log` when the deck is next shown.
