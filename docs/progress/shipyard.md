# Progress: The Shipyard

The running record for this area's chat: the Shipyard web app: designing a boat, her code, her build and trial. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/shipyard/`, `shipyard.html`; settings in `src/config/shipyard.ts`.
- **Its tests while working:** `npm run test:shipyard`. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/shipyard/ (branch `preview/shipyard`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

### (From the modular-builder chat) The stern trawler's exhaust as the tug's

Owner, Oct 2026: the stern trawler gets the tug's exhaust stacks through the wheelhouse and the cooling water out of her side. A new hull-type flag, `exhaustStacks` (`parts/catalog.ts`), on the small tug and the stern trawler, replaces the "is she the tug" test in `parts/hullDef.ts` and in `page.ts`'s Exhaust stacks choice. See `docs/progress/modules.md` for the details and the test steps.

