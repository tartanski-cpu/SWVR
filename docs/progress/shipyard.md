# Progress: The Shipyard

The running record for this area's chat: the Shipyard web app: designing a boat, her code, her build and trial. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/shipyard/`, `shipyard.html`; settings in `src/config/shipyard.ts`.
- **Its tests while working:** `npm run test:shipyard`. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/shipyard/ (branch `preview/shipyard`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Lined up for later (owner's asks, not started)

- **The harbour tug's azimuth drives and their controls** (owner: later).

## Changes

### Exhaust stacks as a part of their own: on the deckhouse, moved along it, round or square casings (preview/shipyard)

Owner, 26 Oct 2026: "the Fair Play reference tag has the exhaust pipes in a kind of standalone box ... split these exhaust pipes out as something that you can control. So in a bigger ship, we can make the wheelhouse smaller. And then I'd like to be able to move the twin exhaust pipes forward and aft on this deck house and choose whether they've got like a circular or a square kind of box around them"; then "Do the Funnel stack part next".

- **New choices** on the Engine step, under Exhaust stacks, on a boat with stacks (the small tug, the stern trawler, the harbour tug) and a deckhouse: **Stacks stand** through the wheelhouse (as before) or **on the deckhouse** (design `stackMount`); then **Along the deckhouse**, its aft end to its front (`stackPos`, 21 steps, `STACK_POS_STEPS`), and **Casings** round or square (`stackCasing`). Not in the short code: such a boat travels as a link or file.
- **On the deckhouse** (hullDef.ts; `CONFIG.shipyard.exhaustStack.onDeckhouse`): each pipe (one per engine) up from her engine space through the deckhouse, then in a casing of its own `casingHeight` 1.6 m tall over its top, `casingPad` 0.3 m round the pipe, its outer face `fromSide` 0.15 m in from the deckhouse's side, `endClear` 0.15 m in from its ends; the pipe `aboveCasing` 1.4 m over the casing, raked or straight as chosen. Kept out of the wheelhouse's plan: where it would stand in it, moved to the nearer end of the wheelhouse along the deckhouse (saying so). With no deckhouse, or no room on it, they go up through the wheelhouse (saying so). The casing is solid to walk round on a walked deckhouse top.
- **The module** (modules/exhaustStack, `fitting.exhaust-stack`): a config `outer` (shape, half-width, top): the casing drawn over the deckhouse and the pipe out of its top; the smoke from the pipe's top as before (`stackOutlet`). Still one mesh for the stacks (no new draw calls).
- **The harbour tug** starts with hers on the deckhouse's aft end in square casings, as the reference tug's.
- Tests: tests/shipyard/stacksOnDeckhouse.test.ts (the tug's at the aft end in square casings, the pipes out of their tops; moved forward, round, never in the wheelhouse; through the wheelhouse when chosen or with no deckhouse, saying so; a link or file). designDoc.test.ts: the three fields not in the code. The full `npm test` and the typecheck pass.
- Checked in the browser: the tug with square casings aft, round ones halfway, square ones forward, and back through the wheelhouse; the Engine step's new controls.
- README: the stacks' choices; the harbour tug's.
- **Shared changes:** src/modules/exhaustStack/index.ts (the casing on a deckhouse; a stack without `outer` is drawn as before).

### The harbour tug: her wheelhouse and deckhouse the player's; her towing gear a choice (approved by the owner 26 Oct 2026; on next)

Owner, 26 Oct 2026: "just looking at the predefined wheelhouse you've given me, it doesn't really match the wheelhouse in the pictures, which is much kind of more narrow, tall. Maybe it's good if you in the shipyard give me the control of the wheelhouse and deckhouse as parametric parts. The other thing that's missing is the tugboat towing equipment isn't there as an option."

- **Her house is the player's** again: catalog.ts `HARBOUR_TUG_FIXED` now holds only her hull (size, bulwarks, bow, sheer, no raised foredeck or cabin below), steel, her fendering, her engines and nozzles, and the gear that doesn't suit her (trawl, dive, outboards, stern drives, pods). Her wheelhouse, deckhouse, windows, saloon, stacks' style and deck gear start from `HARBOUR_TUG_HOUSE` and move like any boat's. She starts with a narrower, taller bridge (owner: "more narrow, tall"): 3.8 m long, 55 % of the deck between her side decks (5.5 m), 2.5 m headroom. The step's one-off line now says what's fixed and what's hers.
- **Her towing gear** (the Towing group: the tow winch, the stern roller): without the stern roller she tows over her bow (the staple at her stem, the winch on her foredeck facing forward); with it she tows over her stern from a towing hook aft of her house, her winch just forward of it, as the small tug does (deckGear.ts: the tug's towing hook for `towsOverBow` hulls too; the staple only without the roller).
- Tests: harbourTugYard.test.ts (her house the player's; with the stern roller, her tow point aft and no staple). The full `npm test` and the typecheck pass.
- Checked in the browser: her outside from three sides and the Wheelhouse step with its controls back.
- README: the harbour tug's paragraph.
- **Shared changes:** none.

### The harbour tug's drives drawn as Z-drives (approved by the owner 26 Oct 2026; on next)

Then (owner, 26 Oct 2026, on a sketch): "engine position is wrong, it should be much lower and further back. And the propellers, the Kort nozzles are backwards."

- **Her engines** (the build, so the game draws them there too, and her balance follows): level and as low as they clear her bottom, their gearbox ends `CONFIG.shipyard.harbourTug.zDriveEngineAft` (0.29) of her length forward of her transom (engineRoom.ts, the stern drive's level-engine rule). Her GM is now 2.1 m (her engines lower).
- **The drive units** (enginePreview.ts `zDrive`): the shaft runs from each engine's flange aft to the drive's head just inside her bottom; the leg down from it half a propeller's diameter forward of her transom's propeller station; the nozzle and propeller forward of the leg (a pulling propeller, its nozzle's mouth forward), the gear housing from the hub aft to the leg. Before, the leg was hidden inside the nozzle and the housing stuck out aft, so the unit read the wrong way round.

Owner, 26 Oct 2026: "for now, you could give her the Kort nozzles behaviour, but you should probably draw them differently in the engine page so that they're not aligned with the shafts ... facing the direction of travel. So like a Z in between the shaft and the thing."

- Her behaviour is as before (stand-in shafts with Kort nozzles). On the Engine step she's drawn with Z-drives (`DesignHull.zDrives`; enginePreview.ts `zDrive`): her engines level, a level shaft aft from each to the drive's head, an upright leg down through her bottom, and at its foot the lower gear housing with the propeller in its nozzle, level, facing ahead (a pulling propeller, as on most azimuth drives). No rudders: an azimuth drive steers by turning. Only the Engine step draws them; her real drives come later.
- Tests: harbourTugYard.test.ts (level propellers, no rudder, level engines). The full `npm test` and the typecheck pass.
- **Shared changes:** none.

### The harbour tug: a fixed one-off in the Shipyard, stop 1 (approved by the owner 26 Oct 2026; on next)

Owner (relayed by the hull modifications chat, Oct 2026): "So this ship hull is basically a one-off. It doesn't need to be parametric. ... I'd like this to appear in the shipyard, but with a fixed hull and with, let's say, all the parts of the wheelhouse fixed, so basically predefined. But the user should have the ability to add a deck crane, a dinghy, and some of the things which, let's say, are from the existing modules" and "you should be able to change the colors, the interior of the wheelhouse perhaps, the instrumentation, but the wheelhouse, I think the funnel stacks, the deck house, all that kind of stuff should be predefined and fixed." Her propulsion (azimuth stern drives and their controls) comes later. To this chat, 26 Oct 2026: start now (taking her hull from the hull chat's preview), a bigger engine for her real power, the Shipyard side only (no harbour check).

- **Her hull** is the hull chat's (`harbourTug`, hulls/designs.ts; merged from preview/hulls f18ff33, not yet on next: moving this to next takes it too). As drawn, no scaling and no bow choice (`DESIGN_HULLS` 'Harbour tug', index 7, `HARBOUR_TUG`).
- **One-offs** (`DesignHull.fixed`, catalog.ts `HARBOUR_TUG_FIXED`; `withFixed`): her fixed choices stay hers. buildDesign applies them whatever the design says, the page's `change()` too, and the page hides each fixed choice's control (its row, its grid of tiles, a heading left empty, the deck gear cards, the Hull step's handles, "Size her for the brief's deck cargo"), with a line at the top of each step: "She's a one-off …" (page.ts `lockOneOff`). Fixed: her size sliders at x1, bulwarks, bow, sheer, no raised foredeck; the deckhouse (2.4 m high, 2 m forward and 2 m aft of the bridge, side decks, its top walked); the bridge on it (4.4 m long, raked out all round, a deep roof); raked stacks; steel; her fendering (no strake or tyres); the trawl, dive and landing gear, outboards, stern drives, pods and stern roller all off; her bow winch; her engines. The player's: colours and finish, the wheelhouse inside and its instruments, the console and furniture, the deck crane, dinghy or rescue boat, searchlight, fire monitor, life rings, anchor.
- **Her fendering** (the hull chat's hulls/fendering.ts) as her protection: a new module `hull.fendering` (modules/fendering) given its mesh and its contact points by the build (parts/fendering.ts `fenderingFit`: the mesh's corners in 0.9 m cells, the one farthest out in each: about a point a metre round her outer face). It provides a side guard with the strake's spring and grip (vessel/physics/guards.ts as the strake's). Drawn with her fixed parts, no draw calls of its own; designed in as about 6 t of rubber high on her sides. (Done as a module rather than in hullMesh.ts so the hull study's viewer doesn't draw it twice.)
- **She tows over her bow** (`DesignHull.towsOverBow`): a towing staple on her stem (new module `deck.bow-staple`, modules/bowStaple: two posts and a roller, her tow point) and her tow winch on the foredeck facing forward, 3 m aft of her stem (deckGear.ts; `CONFIG.shipyard.deckGear.bowStaple`).
- **Her engines** (owner: a bigger engine for her real power): a new 1850 kW harbour tug diesel (V16, 1600 rpm, 8.5 t; ENGINES 5, `HARBOUR_TUG_DIESEL`), only she takes it (`only`; on another hull it's built as the 750 kW, saying so; not tried for a brief, `ONE_TYPE_ENGINES`); twin, on shafts in Kort nozzles until her drives come. The engine bed now takes up to 4000 kW (was 1500).
- **Fitting a ship's machinery** in a game built for small boats:
  - her stern is cut up shallow for drive pods to hang under, so her propellers reach `propDepth` 3.0 m below her waterline as her drives would (`DesignHull.propDepth`), not her transom's draught: 2.4 m propellers, not 0.54 m;
  - her engine room rises into her deckhouse as a machinery casing (`DesignHull.engineCasing`): her engines fit under its top;
  - her weight: the build counts about 160 t of her (steel at `scantlings` 1.6, machinery, fit-out); a real tug of her size is about 494 t on her lines, the rest heavy framing, machinery, tanks and stores. It's carried as `ballastKg` 315 t at `ballastAboveKeel` 3.9 m, which floats her at 3.23 m (her lines 3.3) with a tug's stability, GM 2.0 m (all in her bilge it was 4.6 m, too stiff);
  - her fuel `fuelL` 60 m³, a ship's (`DesignHull.fuelL`; the small boats' rule gave her 4 m³).
- **Measured** (the page's trials, 26 Oct 2026): 11.8 kn flat out (her real 12.2), 900 nm range, 30.8 t bollard pull (a real tug of her power pulls about 60 t: the stand-in shafts; her drives will make it up), 334 crates on deck, £1.41 m. typeFit.ts has these; hullCards.ts her roles (heavy towing; fire).
- The Shipyard camera now looks at all of her when the hull type changes (a 25 m tug inherited the 9 m landing craft's close view).
- Tests: tests/shipyard/harbourTugYard.test.ts (she builds clean near her draught with a tug's GM, her fixed choices hold and the rest are the player's, her fendering's points round her outside her beam, she tows over her bow, a link or file, her engine hers alone). Tests that try every choice on every hull type now leave a one-off out where the choice is fixed on her (sheer, aftFacets, fishHold, handles, narrowConsole, protection, trawlGear, build); hullCards, brief, enginePreview and tugVoice count her and her engine. The full `npm test` and the typecheck pass.
- Checked in the browser (headless Chromium): every step on her, her outside from three sides, her fendering, staple and winch, and her in the game moored at the quay.
- Not done yet: her azimuth drives and their controls (the owner: later); the exhaust stacks stand at the bridge's aft corners, as the small tug's, not the deckhouse's; a mast over the bridge is the usual light mast.
- README: the harbour tug.
- **Shared changes:**
  - src/boats/library.ts: the two new modules registered;
  - src/vessel/view/engineModels.ts: a look for her engine;
  - tests/fleet.test.ts: she isn't in the game's fleet (as the trawler and the cat); adding her is the main game chat's call;
  - tests/sheer.test.ts: leaves a one-off out.

### Scratch boats: a project only when you name or save her (approved by the owner 26 Oct 2026; on next)

Owner, 25 Oct 2026: "when you start a new session, and you just say, you don't give a name, you just say go, it creates a project, and quite often I'm just creating like a throwaway ship to test things. So I don't want it to save a project every time I go in. There should be an explicit save button."

- **Start with a name:** a project at once, saving itself as you work (as before).
- **Start with no name** (or a link or code to a boat): a **scratch boat**. Nothing goes into the projects list: no saving as you work, and when the Shipyard opens afresh the work left on the table is let go, not kept as "Unsaved work". A reload keeps her (the tab's own copy, as before).
- **💾 Save** in the header, shown only on a scratch boat on your own: asks her name (her name at the top if she has one), makes her a project, and from then on she saves herself. The Projects box says which she is.
- Leaving a changed scratch boat (Close project, or opening another) asks first.
- How it's told: a scratch boat is work with no project behind it (page.ts `currentProject()` empty: the start screen clears it, and a name or Save sets it). page.ts `saveScratch`, `showSaved`; `keepWorkLeftOnTable` and the autosave keep only a project's work.
- Checked in the browser (headless Chromium): a scratch boat adds no project, survives a reload, is let go on a new visit; Save makes her a project that then saves her changes; a named start makes one at once. The full `npm test` and the typecheck pass.
- README: scratch boats and 💾 Save.
- **Shared changes:** none.

### (From the modular-builder chat) The dive A-frame and its submersible on any boat big enough

Owner: a dive support vessel for the submersible game, the A-frame and sub "placeable on any boat that's big enough". New design field `diveFrame` (link or file only, not in the code); Deck gear → a new **Diving** group (`gearMenu.ts`, `pinGear.ts`, fitted at the transom). `parts/diveFrame.ts` (new) says where it stands or why not: stern wide enough, about 7.9 m of clear level deck aft of the house, the sub (10 t) no more than a fifth of her weight, GM 0.5 m with the sub lifted, 0.3 m freeboard at the transom with her hung out (trim from her own waterplane), legs lengthened for a high bulwark. As they come, only the stern trawler passes. `parts/deckGear.ts` places it first: it takes the transom (the trawl A-frame, net drum, trawl winches and stern roller left off, with a warning) and its cradle is kept clear of other gear. The frame and the sub are designed into her weights (`parts/weights.ts`, `parts/hullDef.ts` lightship, as the crane is), with the hydraulic pump (`parts/engineRoom.ts`, `parts/recipe.ts`) and the price (£260,000). Settings `CONFIG.shipyard.diveFrame`, `deckGear.price.diveFrame`. Tests: `tests/diveFrame.test.ts`; the menu, pin and code tests updated. Details in docs/progress/modules.md.

### (From the modular-builder chat) Twin stern drives get the twin lever control

`parts/recipe.ts`: two stern-drive legs are worked separately too (the outboard module's `split`), with the twin lever control and START P / START S, as twin shafts. Twin outboards keep one lever. See `docs/progress/modules.md`.

### (From the modular-builder chat) Twin shaft engines get the twin lever control

`parts/recipe.ts`: a twin with shaft engines (not pods, stern drives or outboards) has its diesel's `twin.split` set, the console's `throttle` socket gets `control.twin-throttle`, the START becomes START P and a second, START S (`start2`, bound to `ignition.start2`), joins the ENGINE group (`BASIC_KEEP` too). See `docs/progress/modules.md`.

### (From the modular-builder chat) The autopilot's own group on the console

With the helm assist (`design.helmAssist`), three console push buttons `apPort`, `apOn`, `apStbd` (PORT 5°, AUTO, STBD 5°) in an AUTOPILOT switch group, starboard side, nearest the wheel (`parts/recipe.ts`); `PANEL_SLOTS.AUTOPILOT` (`panelAutopilot`, not in the code); `CONFIG.shipyard.helm.faceSwitchOrder` takes it after DECK. The panel grid's reported starts (`cc.panelGrid.runs[].start`) are now nudged apart when the rules close the switches up tighter than a cell, so pinning a crowded console where it stands keeps every group. The Assist tile's words changed. See `docs/progress/modules.md`.

### (From the modular-builder chat) A TV on the wall

Furniture kind `tv` (`tvAt`, `tvAt2`; not in the code): on the nearest wall at seated eye height, over low furniture but clear of doorways and tall pieces (`parts/furniture.ts`, `CONFIG.shipyard.furniture.tvCeiling` / `tvLowest`); menu entry, icon and about text (`furnishing.ts`, `gearMenu.ts`), ghost height (`placing.ts`); the Add button's limit says each piece's own count (`page.ts`). Also: "moved along the wall to fit" now counts only movement along the wall, not being put back against it. See `docs/progress/modules.md`.

### (From the modular-builder chat) Twelve seats, each turnable

For the crew-transfer catamaran's rows of seats: `design.ts` has seat fields `seatAt5`..`seatAt12` and a facing per seat (`seatFace`..`seatFace12`, 0-7 in 45 degree steps; `SEAT_FACES`, `seatYawDeg`), none in the code; `furnishing.ts` adds `turnSeat` and moves facings up with the seats in `removeFurniture`; `parts/furniture.ts` turns a seat's footprint and socket by its facing; `page.ts` has a Turn button on seat rows. See `docs/progress/modules.md`.

### Her finish: as new, worked or well used (approved by the owner 24 Oct 2026; on next)

Owner (to the main game chat, Oct 2026): "these weathering and rusted texture should be an option in the shipyard, so you can pre-configure a boat to look used or new"; to this chat, 24 Oct 2026: "yes, go ahead with the weathering option". The game side (the `topsides` weathering tile, `Livery.weathering`) is the main game chat's, merged from next.

- **The choice:** Paint step, Hull group, **Finish**: As new, Worked, Well used (design field `finish`: 0 well used, 1 worked, 2 as new, so every design from before reads as well used, as every boat looked). `liveryOf` writes `livery.weathering` from `CONFIG.shipyard.finish` ([1, 0.5, 0]: how much of the tile shows); the page draws it as the game does.
- **Codes:** well used keeps her short code; worked or as new travels as a link or file ("her finish ... isn't in the code"), as the bow fender.
- No draw calls added (the hull's own material).
- Tests: tests/shipyard/finish.test.ts (well used as before, the livery's weathering for each, her hull's material drawn with it, the code and link). designDoc.test.ts: `finish` not in the code. The full `npm test` and the typecheck pass.
- README: the Finish choice.
- **Shared changes:** none (the merge brought the game side).

### A plumb stem raked from starboard, and a slit up the stem head (approved by the owner 24 Oct 2026; on next)

Owner, 24 Oct 2026: "when the pilot boat's got a plumb bow, it's straight from the port side, but not from the starboard ... I can see a missing face actually from the straight in front view."

- **Raked from starboard:** each hull panel (a quad between two stations) is drawn as two triangles, and the diagonal ran the same way round the section on both sides, so starboard's split wasn't port's mirror. At a plumb stem, where the bottom panel has two corners on her centreline, starboard's split left one triangle lying flat in the centreline plane: unseen from starboard, so her stem's edge there was the other triangle's slant, from the keel at the station aft up to the chine at the stem. Now starboard's panels are split as port's mirror (vessel/view/hullMesh.ts), and both sides are drawn the same everywhere. (Not on a catamaran: her demihulls' panels are their own.)
- **The missing face, head on:** a Shipyard stem head is a few centimetres wide (the deck's edge, ±0.03 m), but her sides close to a point below it, and the plate across a bow was drawn only on a square bow (over 0.2 m). The wedge between them, about 0.55 m deep, was open: a slit up her stem head. Now any stem head with width is plated across. This was on every bow rake, not only plumb.
- No draw calls added (a few triangles in her hull mesh).
- Tests: tests/shipyard/stemMirror.test.ts (the pilot boat, plumb, standard and most raked: starboard's panels mirror port's, and her stem head is closed; fails before the fix). The full `npm test` and the typecheck pass.
- **Shared changes:** vessel/view/hullMesh.ts: the panels' diagonals mirrored side to side, and the stem head's plate. Every boat's starboard panels are now split as port's, so her starboard shading can look a touch different (the same shape).

### The Paint step revamped, with more colours (approved by the owner 24 Oct 2026; on next)

Owner, 24 Oct 2026: "could do with a revamp of the painting page, make sure it's organized nicely, and maybe give us a few more options for paint colors."

- **Organised:** the step is in three groups under headings, Hull, Wheelhouse and Roof (each with its ⓘ note), and every choice is a row of colour swatches with its label and, under the label, the name of the colour chosen. Before, the hull swatches had no label, the roof top and frames were word buttons, and nothing named the colour chosen. A swatch marked = follows another part's colour and shows it: the walls follow her paint, the roof her topsides, the top panel the roof (page.ts `PAINT_LIKE`, `paintRow`; the word-button `options()` helper had no other users and is gone).
- **The view:** arriving at Paint looks at all of her from the bow quarter (`setView('Bow ¾')`), not wherever the last step left the camera (often inside the wheelhouse).
- **More colours** (parts/catalog.ts): hull paints 8 → 14 (Teal, Burgundy, Sky blue, Slate grey, Sand, Royal blue, each with its bottom, deck and house colours); wheelhouse walls 10 → 14 (Teal, Burgundy, Sky blue, Sand); roof colours 5 → 9 (Cream, Red, Blue, Sand); roof top panels 5 → 8 (Cream, Black, Orange).
- **Codes kept:** the short code still holds the first 8 / 10 / 5 / 5 (design.ts `CODE_PAINTS`, `CODE_HOUSE_COLOURS`, `CODE_ROOF_PAINTS`, `CODE_ROOF_TOPS`, used in its packing), so every old code reads the same; a boat in a newer colour travels as a link or file ("this paint isn't in the code"). The Shipyard's own steps: `PAINT_TYPES` 14, `ROOF_PAINT_TYPES` 9, `HOUSE_COLOUR_FIELD` 14, `ROOF_TOP_FIELD` 8.
- No new draw calls: the colours are the same materials' colours.
- Tests: tests/shipyard/paintColours.test.ts (every colour offered and distinct, the first ones still in the code, the newer ones by link and back, a newer colour paints her); designDoc.test.ts and houseColours.test.ts keep to the code's colours. `npm run test:shipyard`, the full `npm test` and the typecheck pass.
- README: the Paint step's groups and the new colours.

### (From the modular-builder chat) The bow fender

At the owner's word (24 Oct 2026, crew transfer to wind farms): new design field `bowFender` (not in the code; the catamaran's default 1), worked out in `parts/trim.ts` (`bowFenderAt`), its socket in `hullDef.ts`, module `hull.bow-fender` in `recipe.ts`, weight and price in `weights.ts` (`CONFIG.shipyard.bowFenderPrice`), the Hull step's **Bow fender** tiles in `page.ts` (icons in `tiles.ts`). Details in `docs/progress/modules.md`.

### Fixes from the review of 24 Oct 2026: the dash crash, capsizing boats, a winch with no tow point, the catamaran's roll chart (approved by the owner 24 Oct 2026; on next)

Owner, 24 Oct 2026: "fix 1, 2, 5 and 6" of the Shipyard's findings in docs/REVIEW_2026-10-24.md (3 and 4, the game buttons to Voyage and the same-tab project, are left for the refit work).

1. **A dash laid out by hand crashed the builder** (high): with screens placed by hand, one with no room came off the console, but the shortest-console search (`fullSize`) still looked it up there and threw. The page died, and the broken design was already in the tab's saved copy. Now each screen's cells are read once, before any comes off (parts/recipe.ts `screenCells`). Test: tests/shipyard/dashPinned.test.ts (every dash screen pinned at four columns, every controls level, two hull types). It failed before the fix (landing craft, controls 1, the speed screen at column 2) and passes now.
2. **Boats that would capsize** (medium): under `CONFIG.shipyard.minGM` (0.15 m) the warning, first among her warnings, says "She would capsize: she can't float upright (GM …)", not "low stability" (parts/trim.ts; `lowGM` 0.5 for the old warning). The page greys out **Try her in the game** (its tooltip says why) and **Try her together** until she's fixed (page.ts `floatsUpright`). Saving and sharing her still work, so work in progress isn't lost. The pilot boat at her slimmest and deepest (GM -0.43 m) is told and held back; checked in headless Chromium.
3. **A tow winch with no tow point** (low): the tow point is the stern roller's (its towing hook too, on a tug), so a winch without one never takes a tow. Now the Shipyard says "Her tow winch has no tow point to tow from: fit the stern roller" (parts/deckGear.ts), and the gear menu's line says the winch leads over the roller (gearMenu.ts).
4. **The catamaran's roll chart read "NaN %"** (low): her roll dies in about one swing, two peaks, and the damping was only worked out from three. Now two peaks give it from the half-cycle decrement (shared: vessel/seaTrials.ts); with fewer, the chart draws the measured dots and says "heavily damped" (trialCharts.ts).

- Tests: tests/shipyard/reviewFixes.test.ts (the capsize warning, the tow point warning, the cat's damping and a chart with no NaN; the last failed before the fix), dashPinned.test.ts. `npm run test:shipyard`, the full `npm test` and the typecheck pass.
- README: Try her held back for a boat that would capsize; the tow winch needs the stern roller.
- **Shared changes:** vessel/seaTrials.ts, the roll damping from two peaks and its text line when it can't be measured (one swing's worth: before, NaN).

### Faceted aft windows with windows raked out all round (approved by the owner 24 Oct 2026; on next)

Owner, 24 Oct 2026: "When the raked out option for the sides and aft of the wheelhouse is activated, the three facets on the aft of the wheelhouse are not respected. Please fix that. I would like it so that you can have basically like a proper wheelhouse."

- **Why it was left out:** faceted aft windows were left flat with raked-out windows, on the reckoning that the aft wall leaning aft and the corners angling forward wouldn't meet. They do. The rake (houseFlare.ts) stretches the house as a whole, linear in x and z at each height, so flat walls stay flat and walls that meet keep meeting. The angled aft corners lean out with the sides and aft, as the front's angled corners already did.
- **Fix** (parts/house.ts): the refusal is gone; the page's and README's words say so. A cockpit overhead still leaves them flat.
- **Checked:** tests/shipyard/aftFacets.test.ts (the pilot boat and the tug with both: faceted, raked, no warning). Headless Chromium: the tug with three facets front and aft, raked out all round, Stern ¾, Bow ¾, Stern and Plan. `npm run test:shipyard`, the full `npm test` and the typecheck pass.
- **Shared changes:** none.

### Faceted aft windows: a choice as the front's (approved by the owner 24 Oct 2026; on next)

Owner, 24 Oct 2026: "at the moment we have a three facets option for the wheelhouse and it makes the front faceted. I'd like an additional option that you can have rear windows faceted in the same way."

- **The choice** (design.ts `aftFacets`, 0 flat, 1 faceted; Wheelhouse step, Windows, **Aft**, with its own small drawings, tiles.ts `aftFlat`, `aftFacets`): the aft windows in three facets as the front's are. The middle pane is square across her with the aft door in it; the outer two are angled forward to the side walls, the same width (catalog.ts `facetCentre`) and angle (`CONFIG.shipyard.facetDeg`, 30°) as the front's. Travels as a link or file, not in the short code.
- **Left flat, with a warning,** when the house is too narrow (the middle pane would be all of it), too short (no room for the helm with both ends angled), with windows raked out all round (the aft wall leans out), or with a cockpit overhead (its wings meet the aft corners).
- **The house** (shared: vesselDef.ts `HouseShape.aftFacet`, hullMesh.ts): the aft wall in two pieces each side, split at the facet's corner with a post there, and everything at the aft wall brought forward by its setback (`aftFacetDz`, `setForward`). The floor and the ceiling at the aft wall are cut back to the angled walls (`aftFacetStrip`). The roof slab and its top panel follow, the saloon's if it has its own lower roof (`chamferedSlab` takes an aft facet now).
- **The floor walked** (shared: layout.ts): its aft edge comes forward with the outer panes, so you can't walk out through the corner glass.
- **What stands in the aft corners** (parts/hullDef.ts `intoFacets`): anything inside the house within 0.7 m of its aft wall, off the middle pane, comes forward by the setback at its place: the exhaust stacks (their pipes), the battery switches, the extinguisher, the torch, the line-throwing gun, furniture. The port side door stops short of where the side wall turns in (parts/house.ts).
- **Checked:**
  - tests/shipyard/aftFacets.test.ts: every hull type, also twin with a side door and with a saloon and advanced controls, with a locker and a berth put in the aft corners; every socket and stowed piece inside the house is forward of the angled walls. The corner is off the floor walked and the doorway on. Left flat with raked-out windows, an overhead or a narrow house. The code refuses it.
  - Headless Chromium: the tug and the pilot boat, three facets front and aft, Stern ¾, Plan and Stern views, and the tug from above, cut over the floor (Furniture step). Screenshots.
  - The typecheck and the full `npm test` pass.
  - **Not checked:** walking into the corners in VR.
- **Shared changes:**
  - vesselDef.ts: `HouseShape.aftFacet`.
  - hullMesh.ts: `aftFacetDz`, `setForward`, `aftFacetStrip`; the aft wall split; `chamferedSlab`'s aft facet. A house without aft facets is built as before.
  - layout.ts: the floor walked's aft edge. As before without aft facets.

### Fix: the stern trawler carried the tug's line-throwing gun (approved by the owner 24 Oct 2026; on next)

Owner, 24 Oct 2026: "the stern trawler ... seems to get the line throwing gun. Maybe it's copied over from the tugboat settings."

- **Why:** the gun went on the tug hull, or on any boat whose engine goes on a shaft only (meant as "a boat with the tug diesel is a tug"). When the 750 kW diesel came in, it was shaft-only too, and it is the trawler's as she comes, so she got the gun.
- **Fix** (parts/hullDef.ts): the tug hull, or any hull with the tug diesel itself (catalog.ts `TUG_DIESEL`). The other shaft-only checks (no stern drive or pods with them) are about the drive, and stay.
- Test: tests/shipyard/sternTrawler.test.ts (no gun as she comes; with the tug diesel, the gun). tests/lineGun.test.ts still passes.
- **Shared changes:** none.

### High window sills: a third choice (approved by the owner 24 Oct 2026; on next)

Owner, 24 Oct 2026: "a third option for the windowsills on the wheelhouse to have them higher ... usually you're sort of standing up, so you should be able to see through the windows, but just come up with something which is higher".

- **How high:** 1.3 m above the wheelhouse floor (`CONFIG.shipyard.windowSills.high`). That's level with the top of the dash (0.9 m desk plus 0.41 m dash), so the console tucks under the glass in one line. It's chest height, as on a heavy-weather trawler or tug. A standing helmsman's eyes are about 1.6 m up, so there is still about 0.3 m of glass below eye level, and the band from sill to roof is about 0.7 m deep. Standard is 1.0 m, low 0.75 m.
- **The console stays as with standard sills** (its upright panel on). Low sills alone take it off and put the screens on stalks. Every place that read "any sills" as low now reads low only (design.ts `lowSills`; parts/house.ts, parts/recipe.ts).
- **The page:** Wheelhouse step, Windows group, Sills: Standard, Low, **High** (level with the dash), with its own small drawing (tiles.ts `sillHigh`).
- **Not in the short code:** the code holds the sills as one bit, so a third value would change how old codes read. `CODE_SILLS` stays 2, and a design with high sills travels as a link or file (encode says so). Codes with standard or low sills read as before.
- **Checked:**
  - tests/shipyard/highSills.test.ts (new): the height, the console's view over the dash, and the code (high sills refused, standard and low read back).
  - flare.test.ts and designDoc.test.ts now know the third choice.
  - Headless Chromium on the pilot boat: side view and the view from the helm, standard against high. The bow and foredeck gear stay in view over the high sills; only the strip of deck nearest the wheelhouse is hidden. No warnings.
  - `npm run test:shipyard` and the typecheck pass. **Not checked:** standing at the helm in VR.
- **Shared changes:** none.

### (From the modular-builder chat) The deckhouse run aft: a steep transverse stair instead of its ladder

At the owner's word (24 Oct 2026). `parts/house.ts` `transverseStair` (its treads walked through `layout.extraFloors`), `parts/deckGear.ts` (the life ring and rod rack clear of it), `parts/weights.ts`, `src/config/shipyard.ts` (`deckhouse.walk.stair`). Details in `docs/progress/modules.md`.

### (From the modular-builder chat) The stern trawler: a deckhouse run on aft, up to 2.5 m high; a longer raised foredeck

At the owner's word, in the modular builder's chat (its log, `docs/progress/modules.md`, has the details):
- new design field `dhAft` (the deckhouse run on aft of the wheelhouse, 0.5 m steps to 6 m; not in the code): `design.ts`, `parts/house.ts` (its build, the door steps on its top, its ladder on the aft face), `parts/deckGear.ts` (aft-deck gear keeps aft of it), `page.ts` (the **Aft** slider), `src/config/shipyard.ts` (`deckhouse.aftDeck`, 4 m);
- `MEASURES.dhHeight` to 2.5 m; `SCALES.fcLength` to 15 m (30 steps);
- `tests/shipyard/deckhouseAft.test.ts`; `designDoc.test.ts` lists `dhAft` as not in the code.

### Handles in their own colours (approved by the owner 23 Oct 2026; on next)

Owner, 23 Oct 2026: "different colors of drag handles for the breadth and the width and the depth and all the different things, just so you can see which ones you're dragging".

- **Each handle its own colour** (`CONFIG.shipyard.handles.colours`, by the design choice it drags; `fallback` for any not listed): length orange, bow rake magenta, beam cyan, depth lime, bulwarks violet, sheer yellow, raised foredeck red, its height white. Picked to stand apart from each other, from the grey and painted hulls and from the blue sea; two pairs that looked alike in the first screenshots (pink and coral, yellow and orange) were moved apart.
- **The slider's dot:** each slider with a handle on the view gets a dot of the handle's colour before its name (shipyard.html `.row.handled`; page.ts `showHandles`), so a handle and its slider read as one. Pointed at or held, the handle grows and lightens `hotLift` (0.4) of the way to white instead of turning yellow, and its slider's name and track light up in its colour; the dimension line while dragging is drawn in it too.
- **The bulwarks' handle** moved from 70 % to 85 % of the way aft: on a gillnetter whose raised foredeck runs aft past her house, its break sat beside it seen from the side.
- **Checked:** headless Chromium on the gillnetter with a raised foredeck (Bow ¾ and Starboard views, the beam handle dragged to its limit), screenshots; `npm run test:shipyard` and the typecheck pass. **Not checked:** how the colours read in the Quest's browser.
- **Shared changes:** none.

### The tug and trawler on a displacement hull's resistance; the catamaran redrawn, re-weighed, twin 400s as she comes (approved by the owner 23 Oct 2026; on next)

Owner, 23 Oct 2026: do the hull chat's follow-ups "as they reach next". The hull chat's redrawn catamaran and its displacement curve (vessel/displacementHull.ts, `CONFIG.displacementHull`) went to next today.

- **A displacement hull's resistance** (parts/hullDef.ts): a hull type with regime 'displacement' (the tug, the trawler) takes `displacementResistance(lwl, y)`, a curve that keeps climbing past hull speed, in place of the landing craft's planing curve, which levels off. The catamaran keeps her own; the planing and semi-planing types are as before.
- **The catamaran's weight** (`CONFIG.shipyard.catamaran.scantlings` 0.8, parts/catalog.ts): on her redrawn lines (12.5 × 6.0 m) she came out 14.5 t light, against about 11 to 13 t for real aluminium work cats of her length (the hull chat's 15 to 18 t at 15 m, scaled). Almost all of the excess was her plating: two hulls carry far more plate for her length than one, but each is a small, short-spanned section, built lighter. At 0.8 she is 12.7 t light on twin 280s, 13.5 t on twin 400s.
- **Twin 400 kW as she comes** (her defaults): on her redrawn lines twin 280s make 24.4 kn, under the owner's 25 to 28; twin 400s make 29.7 kn.
- **Re-measured** (typeFit.ts TYPE_FACTS; the same method as before, which reproduced the trawler's previous figures exactly on the old curve):
  - **Tug:** a little slower on every fit, as a displacement hull should be. Single 750 kW 10.2 to 9.1 kn; twin 450s 10.9 to 9.5; twin 400s 10.9 to 9.5. Bollard pulls unchanged. Her card: up to 10 kn (rounded from 9.5), 9.0 t.
  - **Trawler:** within a tenth or two of a knot (she was already slow for her length): 750 kW 10.5 to 10.3 kn.
  - **Catamaran:** twin 150 17.6 kn, twin 280 24.4, twin 400 29.7, twin tug diesels 31.6. Deck 92 crates as she comes (was 82, on her wider redrawn beam), 161 at her largest.
- **Tests:**
  - tests/shipyard/hullResistance.test.ts (new): only the displacement types get the curve; the cat's weight, and twin 400s as she comes.
  - tests/shipyard/inTheGame.test.ts: the twin-engined tug's flat-out speed is now 8.92 kn (was 10.08).
  - `npm run test:shipyard` (333), the full `npm test` and the typecheck pass.
- README: the tug's, trawler's and catamaran's speeds, and the cat's engines and weight.
- **Shared changes:**
  - tests/displacementHull.test.ts (the hull chat's): its check that the planing curve let the tug run away compared against the tug as the Shipyard built her, which was the planing curve until now. It now checks that she is built on the displacement curve, and compares against the planing curve explicitly. Caught by the preview check (the full suite), not by `test:shipyard`.
  - vessel/displacementHull.ts is the hull chat's, only used.

### Handles on the 3D view, stop 2: the rest of the Hull step (approved by the owner 23 Oct 2026; on next)

Owner, 23 Oct 2026: "yes, go ahead with the hull handles" (stop 2 of the handles plan below).

- **Seven more handles** (handles.ts `HANDLES`), each where its slider shows on her and dragged along one line, through stop 1's framework (nothing new in how they're dragged, snapped, undone or shared):
  - **Bow rake** where her stem crosses her DWL, dragged aft. Raking her keeps her stem head and cuts her forefoot back (catalog.ts `bowKeel`), so a stem-head handle wouldn't move; the waterline crossing is read off her stations (`stemAt`). Not on a landing bow, a push bow or the catamaran (`applies`).
  - **Beam** at her starboard deck edge amidships, dragged out; its dimension is from her port deck edge.
  - **Depth** on her deck amidships on the centreline, dragged up; its dimension is from her keel.
  - **Bulwarks** on their top on her port quarter (70 % aft), dragged up; its dimension is from her deck.
  - **Sheer** at her starboard deck edge a fifth of her length aft of the stem, dragged up.
  - **Raised foredeck** at the break, on the centreline at the raised deck, dragged aft. With none, it sits half a metre aft of her stem head: drag it aft to make one. Its dimension is from her stem.
  - **Its height** on the raised deck halfway from her stem to the break, dragged up. Shown only with a raised foredeck.
- **Spread so they don't cover each other** in the usual views: the sheer to starboard and the bulwarks aft (from ahead and from the side they would sit on each other otherwise), and the foredeck's height forward of its break.
- **Her length handle** stays at her stem head. It now sits on the raised foredeck when she has one (it was inside it).
- **The builder says what the handles need** (build.ts `DesignedBoat.deck`): her bulwarks' height and her raised foredeck's break and rise, as built (the break can be moved clear of the wheelhouse or the transom), so the handles sit on what was built, not on a second guess.
- **HandleDef `applies(d)`:** a handle is shown only for a design that has the choice (page.ts `showHandles`).
- **Checked:**
  - tests/shipyard/handles.test.ts: every Hull step handle moves its own way along its line from its lowest step to its highest, on every hull type it shows for; the bow rake handle goes aft while her stem head stays put; which types show the bow and foredeck-height handles.
  - Headless Chromium on the stern trawler and the gillnetter, Starboard and Bow views: each handle hovered (its own name and value: none covered by another) and dragged (beam and depth to their limits, bulwarks 0.6 to 1.0 m, sheer, a raised foredeck made from none, its height, bow rake 25° to 37.5°), with screenshots. The catamaran, pilot boat and tug show the right handles.
  - `npm run test:shipyard` (331) and the typecheck pass.
  - **Not checked:** the Quest's browser (the laser as the pointer); a shared session.
- **Shared changes:** none.

### The small tug turns down twin 750 kW engines (approved by the owner 23 Oct 2026; on next)

Owner, 23 Oct 2026, through the hull chat: two 750 kW engines don't fit a small tug; judge a single one.

- **Measured first:** two 750s do fit *across* her (13 × 5.4 m as she comes): each 1.15 m wide engine's outer side is 1.8 m off her centreline, inside her 2.4 m half-breadth at the engine bed, and 1.3 m between them. What doesn't fit her is the **power**: 1,500 kW in a hull of about 56 t is about 27 kW a tonne. Working tugs and trawlers carry about 8 to 18 kW a tonne. A displacement hull's speed is held by her length, so the extra power only makes waves and overloads a propeller her draught keeps small (1.18 m for the twin; a 750 wants 1.9 m).
- **The rule** (parts/engineRoom.ts; `CONFIG.shipyard.maxKwPerTonne` 20): a displacement hull (the tug, the trawler) takes at most 20 kW a tonne of her lines' displacement. Twin engines past that go in singly (when one is within it), with a warning saying so and what she takes. The tug as she comes takes about 1,120 kW: twin 450 kW tug diesels (900 kW) still go in; twin 750s are refused; a **single 750** (750 kW, about 13 kW a tonne) is accepted. A tug stretched to her longest takes more. The smallest tug (7 m, 23 t) refuses twin 450s too. The trawler is not affected: twin 750s are within her power limit, but they are too tall for her deck, as before.
- **Her card:** the twin-750 trial is gone from TYPE_FACTS (typeFit.ts), so her figures read up to 11 kn (the twin 450s) and up to 9.0 t pull (was 18 kn and 13.0 t, which came from the power she can't take).
- Test: tests/shipyard/bigEngine.test.ts.

### The fast catamaran workboat: a Shipyard hull type (step 3 of the hull chat's three; approved by the owner 23 Oct 2026; on next)

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

### Handles on the 3D view, stop 1: the framework, proved on her length (approved by the owner 23 Oct 2026; on next)

Owner, 23 Oct 2026: "the next big step for the shipyard is to move away from sliders and to have interactive handles that you can drag on the 3D window wherever appropriate". Plan agreed (owner's choices: the view stays as it is when a handle is grabbed; the sliders fold into "Exact values" once the handles are in; start with stop 1):
1. the framework, proved on Length; 2. the rest of the Hull step (beam, depth, bulwarks, bow rake, sheer, raised foredeck and its height); 3. the Wheelhouse (move it, its walls, width, headroom, offset, saloon, overhead, window rake, roof overhang); 4. the deckhouse and the console length, then the sliders folded away. Kept as sliders or tiles: choices (types, materials, styles, colours), the roof's thickness and edge angle, the floor height (perhaps a handle in a section view later).

- **The handle** (handles.ts `HANDLES`, page.ts `showHandles` … `updateHandles`): a round handle on her at the point a slider sets, the same size on the screen however near or far, drawn over her; hidden when it would be dragged end-on to the view (her length handle in the Bow and Stern views), while placing, with a tool on, or in a live trial.
- **Hover:** it lights up (and its slider's row), and says "Length 9.75 m · drag to change".
- **Drag:** along its one line (her length: fore and aft), snapping to the slider's steps. Where the handle sits at each step is the builder's answer (her built at that step, about 40 ms, read off her: `anchor`), worked out a step at a time from when the pointer comes over it (nearest steps first), so the drag picks the step whose point is nearest the pointer (handles.ts `alongAxis`, `nearestStep`). Each step is applied as the slider does (page.ts `change`), so the boat reshapes live, undo merges the drag into one step, and in a session the others see it as they see a slider (and who's holding it).
- **The dimension:** while dragged, a line from where it's measured (her transom, along her deck) to the handle, and its name and figure beside the pointer ("Length overall 11.46 m"); past her last step, "as far as it goes" in red.
- **Her length handle:** at her stem head on the centreline, at the Hull step.
- **Checked:** tests/shipyard/handles.test.ts (the pointer read along the line from a slanting ray, none end-on; snapping, steps not yet worked out passed over, the limit; her length handle at the stem head moving forward as she lengthens, the dimension her length). Headless Chromium on the gillnetter, Starboard view: the handle at her stem head, its tip and her slider lit; dragged forward to her longest (11.46 m, "as far as it goes"), the boat redrawn, the dimension line drawn; one undo back to 9.75 m. `npm run test:shipyard` and the typecheck pass. **Not checked:** the Quest's browser (the laser as the pointer); a session.
- **Shared changes:** none.

### Hull cards and the brief's engine search re-measured with the 750 kW diesel (approved by the owner 23 Oct 2026; on next)

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

