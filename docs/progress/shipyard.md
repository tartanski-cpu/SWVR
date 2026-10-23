# Progress: The Shipyard

The running record for this area's chat: the Shipyard web app: designing a boat, her code, her build and trial. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/shipyard/`, `shipyard.html`; settings in `src/config/shipyard.ts`.
- **Its tests while working:** `npm run test:shipyard`. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/shipyard/ (branch `preview/shipyard`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

### Rework, part 3 of 3: gear and furniture placed by pointing (approved by the owner 23 Oct 2026; on next)

Owner, 23 Oct 2026: "the whole placement of furniture and deck equipment is a bit clunky, because if it doesn't allow you to place it, it basically saves a warning on the right hand panel, and then you get these pins all over the place ... people need an easy way to place and move equipment ... make sure it doesn't come up with all that junk on the right hand side."

- **Placing by pointing** (placing.ts `previewPlace`, page.ts `startPlacing` … `placeHere`): Place (or Move, or Add on the Furniture step) picks a piece up; a see-through box of its size (`ghostSize`) follows the pointer over her, **green** where it will stand, **red** where it won't, with a few words beside the pointer. A click on green puts it there; a click on red does nothing (the words shake). **R** turns the crane or winch, **Delete** takes off the piece being moved, **Esc** stops.
- **The builder's own answer:** each 25 cm cell is tried by building her with the piece there (build.ts `buildDesign`, about 40 ms; asked again only on a new cell, kept until the design changes). Gear on the grid and furniture: the builder's `placed` (right there, or moved up to a metre / slid along the wall to fit: the copy shows where) or its new **`placeWhy`** (deckGear.ts `whyNotOnDeck`: "across the break of her raised foredeck", "too near her bow", "too near her transom", "over her side", "against the wheelhouse", "on her other gear or a ladder"; on the roof, "too near the roof's edge…"; furniture.ts `furnitureWhy`: "not inside the wheelhouse…", "longer than … floor", "no room here…", "only … m of headroom here"). The skiff, the life ring and the rods: whether their socket was made, else the builder's warning for it.
- **Moving:** at Deck gear and Furniture, pointing at a piece on her says "click to move it · Delete takes it off"; a click picks it up (as Move).
- **Pins are notes only:** the pin's equipment list is gone, and gear isn't placed from pins any more (`placeFromPins`, the Pins list under the Deck gear menu, the pin's "moved" bookkeeping all taken out). Old pins that asked for gear stay as notes. So nothing is written in the right-hand column while placing; its warnings are only the design's real problems.
- **Checked:** tests/shipyard/placing.test.ts (the crane green on clear deck and put right there, red over the wheelhouse "against the wheelhouse"; the winch over her side moved or red with a reason; a berth green inside the wheelhouse, red outside "not inside"). Headless Chromium on the gillnetter: the crane green on the aft deck, red over the house with its words, a click on red does nothing, a click on green places it (no warnings), pointing at it offers to move it, picked up, turned with R, moved, taken off with Delete; a berth green against the port wall, placed. `npm run test:shipyard`, the full suite and the typecheck pass. **Not checked:** the Quest's browser (pointing there is the controller's laser: should work as a mouse, untried); designing together (each person's placing is their own; the result is shared as any change).
- **Shared changes:** none (`placeWhy` is on the Shipyard's own DesignedBoat).

### Rework, part 2 of 3: hull-type cards instead of the brief document (approved by the owner 23 Oct 2026; on next)

Owner, 23 Oct 2026: "replace this first sort of step of the design process with something more visual ... you see the different hull types, and you see next to them what they're most suitable for ... I quite like the side screenshots that you get of a boat when you do the compare view." Agreed: rendered side views; the brief's targets kept, folded away; "exploring" a tag only.

- **The first step is now Type** (shipyard.html `data-step="brief"`, titled "Type"): in the middle, a card per hull type offered (hullCards.ts `hullCards`, the retired workboat left out), each with her picture from starboard (page.ts `profileShot`, rendered once as the cards first show, one boat at a time, on the cards' colour), her name and what she is (from her type's name), **Made for** and **Also** tags (hullCards.ts `HULL_ROLES`), and three measured figures (typeFit.ts TYPE_FACTS: her best speed, her deck as she comes to stretched, her best pull).
- **Roles:** landing craft: cargo / light towing, exploring. Gillnetter: fishing, pots / light towing, cargo. Pilot boat: search & rescue, fire / light towing, exploring. Small tug: heavy towing / fire. Stern trawler: trawling / cargo, towing. "Exploring" is a tag only: no game job checks it yet.
- **Clicking a card** starts from that hull (her type's defaults, bare of deck gear, her usual engine) and goes on to the Hull step. With speed, range, price or towing targets set, her engines are first tried by trial and the one that does it fitted (as before: page.ts `startFrom`), the progress shown over the cards.
- **Her jobs and targets** are in a folded box on the left ("optional"): they work as before (the top figures and the right-hand column check them; the cards say which types can meet them: "Best for the brief", "Meets the brief", "2 targets short").
- **Taken out:** the typed brief on paper (briefPaper.ts, its styles and tests) and the ranked list of types on the left (the cards replace it), and "Or open a saved design or a code" (the start screen does that now).
- **Checked:** tests/shipyard/hullCards.test.ts (a card per offered type, each with roles and figures; the owner's roles). Headless Chromium: the cards with their pictures; a card clicked starts her and goes to the Hull step. `npm run test:shipyard` and the typecheck pass. **Not checked:** the Quest's browser; a session (everyone sees the cards; one person's click starts the boat for all, as starting from a type did).
- **Shared changes:** none.

### Rework, part 1 of 3: the Shipyard opens on a project (approved by the owner 23 Oct 2026; on next)

Owner, 23 Oct 2026: "every time I go back to the page, it seems to remember all of those things in the previous design ... when you load in, it's basically empty, you don't have a project, so it cleans all the settings. And then it says, do you want to make a new project or open an existing one?" The plan agreed for the whole rework: 1) start with a project; 2) hull-type cards with what each is for, instead of the paper brief (its targets kept, folded away; "exploring" as a tag only for now; rendered side views); 3) placing gear and furniture directly, a green or red copy following the mouse, no pins or placement messages.

- **The start screen** (page.ts `showStartScreen`, shipyard.html `#yardStart`): a new project (her name), a saved one (Open, Delete), or a new one from a favourite. Nothing of the last design is on the table until you choose.
- **A tab with a project open** is marked in the tab's own storage (`swvr.yard.open`, sessionStorage): a reload keeps the work open; coming back to the Shipyard later (a new tab or visit) starts at the start screen.
- **Projects save themselves** (`autosaveProject`, with every save of the working copy, 0.8 s after a change): no Save button. Her picture is retaken at most once a minute (it takes a render), and on closing. Renamed at the top, the project takes the new name (projects.ts `saveAs`), not a second copy. **Close project** (📁 Projects) saves it and goes back to the start screen. Opening another from 📁 Projects keeps this one (as before).
- **Work left from before** (the old autosaved design): on opening afresh it goes back into its project, or becomes a project "Unsaved work (date)" (projects.ts `keepLeftWork`), so nothing is lost; then the table is cleared.
- **Her code is no longer kept in the page's address** (it made a reload read as a link to a new boat). A link or code opens as a new project, and is taken off the address once read. Sharing builds its own link, as before.
- **Designing together** is unchanged: a session link opens the session, no start screen, nothing autosaved into projects.
- **Checked:** tests/shipyard/projectStart.test.ts (saving again updates; a rename moves the project; left work back into its project, or "Unsaved work"). Headless Chromium, the whole flow: an old browser's work kept as "Unsaved work" and the start screen shown; a new project named; a change saved into it; a reload keeps it open; Close project back to the start screen; opened again with its change; a new tab shows the start screen. `npm run test:shipyard` and the typecheck pass. **Not checked:** the Quest's browser; designing together with this change.
- **Shared changes:** none (README's Projects paragraph only).
### (From the modular-builder chat) The stern trawler's exhaust as the tug's

Owner, Oct 2026: the stern trawler gets the tug's exhaust stacks through the wheelhouse and the cooling water out of her side. A new hull-type flag, `exhaustStacks` (`parts/catalog.ts`), on the small tug and the stern trawler, replaces the "is she the tug" test in `parts/hullDef.ts` and in `page.ts`'s Exhaust stacks choice. See `docs/progress/modules.md` for the details and the test steps.

