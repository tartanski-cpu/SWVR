# Progress: The Shipyard

The running record for this area's chat: the Shipyard web app: designing a boat, her code, her build and trial. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/shipyard/`, `shipyard.html`; settings in `src/config/shipyard.ts`.
- **Its tests while working:** `npm run test:shipyard`. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/shipyard/ (branch `preview/shipyard`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

### The small tug turns down twin 750 kW engines (done, on the preview)

Owner, 23 Oct 2026, through the hull chat: two 750 kW engines don't fit a small tug; judge a single one.

- **Measured first:** two 750s do fit *across* her (13 × 5.4 m as she comes): each 1.15 m wide engine's outer side is 1.8 m off her centreline, inside her 2.4 m half-breadth at the engine bed, and 1.3 m between them. What doesn't fit her is the **power**: 1,500 kW in a hull of about 56 t is about 27 kW a tonne. Working tugs and trawlers carry about 8 to 18 kW a tonne. A displacement hull's speed is held by her length, so the extra power only makes waves and overloads a propeller her draught keeps small (1.18 m for the twin; a 750 wants 1.9 m).
- **The rule** (parts/engineRoom.ts; `CONFIG.shipyard.maxKwPerTonne` 20): a displacement hull (the tug, the trawler) takes at most 20 kW a tonne of her lines' displacement. Twin engines past that go in singly (when one is within it), with a warning saying so and what she takes. The tug as she comes takes about 1,120 kW: twin 450 kW tug diesels (900 kW) still go in; twin 750s are refused; a **single 750** (750 kW, about 13 kW a tonne) is accepted. A tug stretched to her longest takes more. The smallest tug (7 m, 23 t) refuses twin 450s too. The trawler is not affected: twin 750s are within her power limit, but they are too tall for her deck, as before.
- **Her card:** the twin-750 trial is gone from TYPE_FACTS (typeFit.ts), so her figures read up to 11 kn (the twin 450s) and up to 9.0 t pull (was 18 kn and 13.0 t, which came from the power she can't take).
- Test: tests/shipyard/bigEngine.test.ts.

### The fast catamaran workboat: a Shipyard hull type (step 3 of the hull chat's three; done, on the preview)

Owner, 23 Oct 2026, through the hull modifications chat (steps 1 and 2, her lines and her two-hull physics, are theirs, on `next`): "a catamaran workboat, a wider working platform for cranes etc., the wheelhouse forward OR aft, stiffer in roll, fast: 25-28 kn on all sizes with the engines we have". Her card (owner): made for Cargo, Fire and Exploring (a tag).

- **The hull type** (parts/catalog.ts, the seventh: `catamaran: true`): the hull study's `workCat` scaled, her demihulls' spacing with her beam and her wet deck's height over her DWL with her depth; her own fine bows (no bow choice, no ramp or push fender); aluminium; the house forward (Position moves it aft); twin 280 kW by default. design.ts `HULL_TYPES` 7; not in the short code (a link or file).
- **Her lines floated at her weight:** the wet deck rises with her lines (parts/hull.ts `raised`).
- **Her stability:** the build's own waterplane measure (parts/common.ts `atDWL`) takes a catamaran's two strips, each hull's second moment about her centreline (`catStripsInertia`, as vessel/hydrostatics.ts does), not one strip across her tunnel: GM about 7 m at standard size.
- **Her handling** (parts/trim.ts, hullDef.ts; vessel/catamaran.ts `catamaranHandling`, the hull chat's): her resistance a catamaran's, her roll radius of gyration and her added roll inertia; no planing turn model.
- **Twin engines always, one in each hull** (parts/engineRoom.ts): engines, shafts, propellers and rudders at half her hull spacing out, under each hull's keel. Her engine space and hatch over the starboard hull's engine, sized to the inside of that hull (`catInside`), not across her tunnel. The 750 kW is too tall for her hulls (said so).
- **Sections read by their outer side:** `halfBreadthAt` reads a section's last three points (a catamaran's starboard hull's keel, chine, deck edge; the same points as before on a monohull).
- **Her trials** (gearbox matched; typeFit.ts TYPE_FACTS, her card):

  | Size | Twin 150 kW | Twin 280 kW | Twin 400 kW | Twin 450 kW |
  |---|---|---|---|---|
  | 10 m (11.2 t) | 18.2 kn | | 31.3 kn | |
  | 12.5 m (13.7 t) | 17.4 kn | **25.5 kn** | 30.6 kn | 29.3 kn |
  | 14.7 m (17.3 t) | 13.5 kn | | 28.0 kn | |

  Every size makes 25-28 kn and more on a twin she can take. The Shipyard weighs her heavier than the hull chat's estimate (13.7 t at standard against 9.3 t: her plating, both hulls and the bridge deck, and her outfit over her full deck), so the small engines make less than their table; 13.7 t is within what real 12 m aluminium work cats with twin V8s weigh. Deck: 82 crates (159 at her largest).
- **Icons:** the stern trawler and the fast catamaran have their own Hull-step drawings (tiles.ts `trawler`, `catamaran`; the trawler had the workboat's).
- **Checked:** `npm run test:shipyard` (the build, bow and engine-balance tests take her in: no bow choice; her CG 1.23 m from her LCB, her shafts already at their steepest with her house forward); the full suite; headless Chromium: her card with her picture, the Hull step (from ahead, both hulls and the tunnel), the Engine step (an engine, shaft, propeller and rudder in each hull), and the game (afloat at the quay, her house forward, both hulls from ahead). **Not checked:** the Quest; her sailing in the game by hand (her sea trials ran the game's physics); designing together.
- **Shared changes:** tests/fleet.test.ts: the fast catamaran isn't in the game's fleet yet (as the stern trawler), so the one-boat-a-type check leaves her out; adding her to the fleet is the main game chat's call. (The catamaran physics itself is the hull chat's.)

### Handles on the 3D view, stop 1: the framework, proved on her length (done, on the preview)

Owner, 23 Oct 2026: "the next big step for the shipyard is to move away from sliders and to have interactive handles that you can drag on the 3D window wherever appropriate". Plan agreed (owner's choices: the view stays as it is when a handle is grabbed; the sliders fold into "Exact values" once the handles are in; start with stop 1):
1. the framework, proved on Length; 2. the rest of the Hull step (beam, depth, bulwarks, bow rake, sheer, raised foredeck and its height); 3. the Wheelhouse (move it, its walls, width, headroom, offset, saloon, overhead, window rake, roof overhang); 4. the deckhouse and the console length, then the sliders folded away. Kept as sliders or tiles: choices (types, materials, styles, colours), the roof's thickness and edge angle, the floor height (perhaps a handle in a section view later).

- **The handle** (handles.ts `HANDLES`, page.ts `showHandles` … `updateHandles`): a round handle on her at the point a slider sets, the same size on the screen however near or far, drawn over her; hidden when it would be dragged end-on to the view (her length handle in the Bow and Stern views), while placing, with a tool on, or in a live trial.
- **Hover:** it lights up (and its slider's row), and says "Length 9.75 m · drag to change".
- **Drag:** along its one line (her length: fore and aft), snapping to the slider's steps. Where the handle sits at each step is the builder's answer (her built at that step, about 40 ms, read off her: `anchor`), worked out a step at a time from when the pointer comes over it (nearest steps first), so the drag picks the step whose point is nearest the pointer (handles.ts `alongAxis`, `nearestStep`). Each step is applied as the slider does (page.ts `change`), so the boat reshapes live, undo merges the drag into one step, and in a session the others see it as they see a slider (and who's holding it).
- **The dimension:** while dragged, a line from where it's measured (her transom, along her deck) to the handle, and its name and figure beside the pointer ("Length overall 11.46 m"); past her last step, "as far as it goes" in red.
- **Her length handle:** at her stem head on the centreline, at the Hull step.
- **Checked:** tests/shipyard/handles.test.ts (the pointer read along the line from a slanting ray, none end-on; snapping, steps not yet worked out passed over, the limit; her length handle at the stem head moving forward as she lengthens, the dimension her length). Headless Chromium on the gillnetter, Starboard view: the handle at her stem head, its tip and her slider lit; dragged forward to her longest (11.46 m, "as far as it goes"), the boat redrawn, the dimension line drawn; one undo back to 9.75 m. `npm run test:shipyard` and the typecheck pass. **Not checked:** the Quest's browser (the laser as the pointer); a session.
- **Shared changes:** none.

### Hull cards and the brief's engine search re-measured with the 750 kW diesel (done, on the preview)

Owner, 23 Oct 2026: "yes, re-measure them with the 750".

- **Re-measured** (typeFit.ts TYPE_FACTS `fits`): every hull type at standard size, bare, every engine fit single and twin, the 750 kW included, gearbox matched (trial.ts matchGear), the game's sea trials. **Fits whose engine won't go under her deck are left out** (the tug diesel and the 750 in the landing craft, the gillnetter and the workboat; the 750 in the pilot boat; twin 750s in the trawler), so the cards and the ranking never promise a boat that can't be built. The stern trawler as she comes (single 750): 10.5 kn, 48 nm, 11.2 t pull. The small tug: single 750 10.2 kn / 6.3 t; twin 750s 18.0 kn / 13.0 t.
- **The brief's engine search** (page.ts startFrom) now tries only the engine fits that go under her deck (built first, about 40 ms each), so it can't fit one that doesn't.
- **A crash fixed** (parts/hullDef.ts `lightshipLess`): twin 750s in the landing craft (9.6 t of engine in a boat of about 5 t) threw "the parts weigh more than the boat" on the builder's first pass (weighed as her lines' displacement, before her weights are known) and would have stopped the page. That pass's lightship isn't used; the second pass weighs her and warns.
- **To raise with the main game chat** (shared vessel physics, not changed here): the small tug with twin 750s (1500 kW) trials at 18 kn, well past a 13 m displacement hull's speed (about 10 to 12 kn): her resistance curve doesn't climb steeply enough past her hull speed.
- **Checked:** the measurements themselves (six hulls, every fit); tests/shipyard/bigEngine.test.ts (twin 750s in the landing craft build, warned); `npm run test:shipyard` and the typecheck pass.
- **Shared changes:** none.

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

