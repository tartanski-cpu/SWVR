# Progress: The main game

The running record for this area's chat: the landing page, Career and Voyage gameplay, multiplayer, the app shell and menus. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/app/`, `src/ui/`, `src/career/`, `src/voyage/`, the gameplay folders (`rescue/`, `tow/`, `fire/`, `fishing/`, `salvage/`, `cargo/`, `duties/`, `traffic/`, `wildlife/`, `potting/`, `fuel/`, `board/`), `src/player/`, `src/controls/`, `src/environment/`, `src/ocean/`, `src/nav/`, `src/chart/`, `src/net/`, `src/audio/`, `src/render/`, `src/main.ts`, `src/mode.ts`, `index.html`, `career.html`, `voyage.html`; settings in `src/config.ts`.
- **Its tests while working:** `npm test` (all of it). Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/next/ (branch `next`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

### Training mode: the plan (30 Oct 2026)

Owner: "Take a look at the RYA power boat syllabus and the German Sportbootführerschein and come up with a plan to build out the Training module."

- **`docs/TRAINING.md`** (new): what the two schemes ask of a trainee (researched from the RYA's course pages and centre transcriptions of the G20, and from the SpFV, its Anlagen, the ELWIS scoring key and question catalogues and the DMYV/DSV examiner guideline, checked twice); what the game already judges and what it lacks; four practice courses of exercises (Harbour, Rescue, Coast, Passage) and an Examiner's Run in the SBF's form, each exercise tied to a syllabus item and to the game's state; the training harbour as one region data file; the exercise engine on the first-voyage tutorial's pattern; recording as sampled state (host-side, IndexedDB) with a chart review first and a rendered replay only if wanted; the instructor in multiplayer; seven milestones; thirteen questions for the owner; what is flagged as unwise.
- **A finding that matters:** prop walk is only on the old workboat; every Shipyard-built boat has it set to zero (`config/modules.ts` propeller block), and the beginner boat is a stern drive. The prop-walk lessons need a shaft boat that has it (question 2 of the plan).
- **Nothing built.** No code changed.
- **Shared changes:** `CLAUDE.md` Docs list gains `docs/TRAINING.md`.

### Desktop field of view; longline messages; a boat hook on every boat (29 Oct 2026)

Owner: "The desktop players want a field of vision settings slider." And: "If you drop the reel in the water in a fishing ground, it says you've lost the reel ... It should say line set ... it should allow you to set it anywhere. You just don't get any fish ... So it should never say that message. And then I noticed that the trawler doesn't have a boat hook, so I couldn't retrieve the line."

- **Field of view (desktop)** (menu Settings → Comfort, −5° / +5°): 50° to 110°, 70° to start (`CONFIG.render.fovSetting` {min, max, step}; `userSettings.desktopFov`, remembered on the device). It sets the camera at once, and the helm's and the camera mode's own views go back to it when you leave them. In VR the headset sets the view, so the row does nothing there (the note says so).
- **Longline messages** (`fishing/longlineHands.ts` announceSetting): a tub let go over the side under way now says **"Line going out over the stern: keep her straight, 3 to 8 knots..."**, then once the far buoy is in **"Line set: 300 m, 50 hooks, on Calder Bank"** (or **"off any fishing ground (it will catch little)"**), and **"Line lost"** only if she stopped before `CONFIG.longline.minM` m were out. The line could always be set anywhere; the wrong message came from the cargo hands (`cargo/cargoHands.ts`), which took any crate gone into the sea for a lost crate: a tub let go from aboard a boat no longer says "lost in the sea". `fishing/longline.ts` exports `groundOf` for the ground's name.
- **A boat hook on every Shipyard boat** (`shipyard/parts/deckGear.ts`, `recipe.ts`): it used to come only with the life ring (the stern trawler as she comes has none). Now every design has the boat-hook rack: beside the life ring if she has one, else in clips on her port bulwark aft. The ring (and with it the rescue calls) stays a choice of its own; the Life ring upgrade's text says so.
- **Tests:** tests/boatHookEveryBoat.test.ts (new: every hull type, with and without the ring, has a hook on the right side; the ring only where chosen or built in), tests/menu.test.ts (the field of view steps by 5°), and all of `npm test`.
- **Checked:** in the headless browser the camera's field of view went 70° → 100° from the menu. **Not checked:** the longline messages and the trawler's hook by eye, or anything on the Quest.
- **Changes in another area's files:** `src/shipyard/parts/deckGear.ts` and `src/shipyard/parts/recipe.ts` (Shipyard: the boat hook on every design; small).

### At the helm, A / D steer (29 Oct 2026)

Owner: "if you pressed F on the keyboard to drive the vessel, even if you don't have a controller ... you can then use the WASD keys to steer and throttle. And when you're not connected to the helm, then you can use that to walk."

- **A / D steer at the helm** (`app/App.ts` handleDebugDriving): with F's helm taken, A and D turn the wheel as ← → do (W / S were the throttle there already; walking is off at the helm). Off the helm, WASD walk as before; the arrow keys still steer from anywhere. Not while a clicked control is being key-steered or the crane's remote is in hand. The azimuth tug's helm keys are unchanged (WASD is her port drive there).
- **The hint at the helm** says so: "A D or ← →: steer · W S or ↑ ↓: throttle".
- **Also looked at** (owner: "grabbing the wheel, the player still moves around with the WASD"): holding the mouse on the wheel stopped walking and W worked the throttle in a headless check on the pilot boat, the small tug, the fishing boat, the landing craft and a single and a twin gillnetter. A click-to-hold wheel was tried and taken back at the owner's word (keep the control scheme).
- **Not checked:** by hand on the desktop.

### Motion coupling: 9 / 0 and the menu step from your setting (29 Oct 2026)

Owner: "The motion coupling setting seems to be broken. I can only put it down to 90 with the keys. Doesn't seem to make any difference."

- **The cause** (`app/App.ts`): on the desktop the view rides rigid in the wheelhouse and with the reticle on a control (`CONFIG.comfort.desktopRigidAtControls`, so the console holds still to click), and 9 / 0 and the menu's −10 % / +10 % stepped from that moment's coupling (100 % there), not from your setting: each 9 set it to 90 % again. The menu showed the moment's figure too.
- **Now** (`couplingSetting`): they step from, and the menu shows, your setting (VR's in VR, the desktop's on the desktop). Set it in the wheelhouse and the note says it's rigid there and takes effect out on deck.
- **Not changed:** the desktop's rigid view at the controls (by design, Oct 2026); in VR the setting applies everywhere.
- **Tests:** tests/comfort*.test.ts (the filter, unchanged) pass; the stepping isn't covered by a test (it's in the App).
- **Not checked:** on the Quest, or by eye in the headless browser.

### The quay's planning board: one view for everyone (29 Oct 2026)

Owner: "is the big planning board synchronized for all the players in multiplayer? It should be, not the personal VR one, but just that big planning board."

- **One view** (`voyage/chartPad.ts` `shared`; App's quay pad): the board shows the plan's `view` (voyage/plan.ts, the old table's shared view, kept). A zoom or drag shows at once on your board and goes out as the `plan` intent `view` (centre and span), at most every `chart.shareEveryMs` (120 ms); everyone's board takes the shared view once nobody at it here has moved it for `chart.shareHoldMs` (700 ms), so your own drag never fights the others'. The host applies it (span no closer than `chart.minSpan`) and saves it with the plan, as before. Never moved yet, the first to look at it opens it round their boat.
- **Still each player's own:** the VR chart board and the desktop's M chart (the owner: "not the personal VR one"; the M chart taken as personal too, to be confirmed). The tool in hand and LAYERS stay each player's.
- **Tests:** tests/chartPad.test.ts: one player's drag and the other's zoom show on both boards; tests/voyagePlan.test.ts: the `view` intent.
- **Not checked:** in a real two-player game (crewcheck) or on the Quest.

### Stuck at the top of the stairs: fixed (29 Oct 2026)

Owner: "I still get blocked at the top of the stairs ... I walk up the stairs and I get stuck before the platform and I cannot get past it", "any boat that's got the transverse stairs, they all have the same problem at the top of the stairs".

- **The transverse stair** (a deckhouse's stair across its aft face, the harbour tug's and any Shipyard deckhouse run on aft of the wheelhouse; `vessel/layout.ts`): its slope ended at the landing's edge, but the landing was floor only from 15 cm in (the Shipyard's `extraFloors` are trimmed by half the body's radius each side), and the deckhouse top's walked part stops short of it too. The step off the slope's head landed on nothing, so you were held there. The landing is now a floor of its own, all of it, from the slope's head (`stairLanding`), clear of gear on it.
- **The crew area's stair** (`app/engineRoom/crew/walk.ts`): the same kind of gap at its head. The slope ended at the stair's head, and the main deck keeps 5 cm clear of the stair well's edge, so going up you were held 1 cm short. The slope now runs on level 15 cm past its head onto the main floor (`HEAD_OVER`).
- **Why the tests missed it:** they checked each floor where it is, not the step from one to the next. New tests walk as the game walks you (player/locomotion.ts: small steps, half a step where a whole one is stopped, your height easing onto the floor): tests/deckhouseStair.test.ts (up the tug's stair, across the landing, on, and back down; every hull type with a deckhouse run aft, 1.5 and 3 m), tests/crewArea.test.ts (up the crew stair onto the main deck and down, at three places across it). Both fail without the fixes, where you were held.
- **Not checked:** on the Quest. The raised foredeck's ladders and the cabin stairs weren't reported and aren't changed.
- **Shared changes:** `src/vessel/layout.ts` (the stair landing as floor).

### The quay's chart board stands upright; the VR chart board stands in the world (29 Oct 2026)

Owner, testing the maps: "The main planning board ... should appear in a vertical frame, like a big TV, not horizontal. It's going to be easier to use"; and the VR board "shouldn't be stuck to your hand. It should be an object that appears in the world and stays in relation to the boat ... you should be able to grab it and move it around so you can ... put it somewhere inside the boat and it stays there".

- **The quay's board** (`voyage/planTable.ts`, the 'table' form): the planning chart upright, `table.face` 2.2 m across at `table.aspect` 1.5 (1.47 m tall), its foot `table.bottom` 0.75 m up, leaning back `table.tiltDeg` 8°, in a dark bezel on two posts with feet (footprint `table.width` 2.4 × `table.depth` 0.9 m, found as before by `planTableSpot`). It faces the way you come up from the water, north at its top. Two draw calls (the stand, the board) plus its face. The stand fallback is unchanged. `table.height` went.
- **The VR chart board** (`player/chartBoard.ts`, rewritten): Open the chart puts it `board.ahead` 0.65 m in front of you and `board.below` 0.3 m under your eyes, facing you, attached to the boat you're aboard (her drawn root; else the world), so it goes with her. A grip within `board.grab` 0.1 m of its frame takes it (either hand; that hand is busy, so no grab-walking with it); let go and it's attached to the boat you're aboard there. Its face is now worked as the other planning charts are (`PadFaces`: either hand's pointer, the trigger, the right stick zooms), from up to `board.reach` 2.5 m; it has the LAYERS key. Bigger: `board.width` 0.6 → 0.8 m. `board.offset` went. If the boat it was on goes, it's put away.
- **Tests:** tests/chartPad.test.ts: the board comes up in front of you on the boat, goes with her, a grip on its frame carries it a metre and it stays there on her, a grip away from it doesn't take it; the stand narrower than the board.
- **Checked headless:** the Oban board from in front and from above (on the quay by the CARGO screen and a lamp post), the chart board standing in the world.
- **Not checked:** on the Quest (grabbing and pointing in the headset).

### Potting always on, quicker soak (29 Oct 2026)

Owner, asking why potting needed switching on: "remove the switch, potting always on"; and "reduce the soaking time for lobster pots for a minimum of 8 minutes, the maximum of 20".

- **Quicker soak** (`CONFIG.potting.soakReady` 1200 → 480 s, `soakBest` 2400 → 1200 s): a pot's ready to haul after 8 minutes of play (its flag goes green), and fishes better until 20.

- **Always on** (`app/App.ts`): the host's page (or a lone player's) sends `pottingOn` at the start of every game, as it did with the setting on; crew get it with the world. The pot grounds on the chartplotter and the local potters' VHF tips now come for everyone.
- **The setting is gone:** Settings → Game → Potting (`ui/mainMenu.ts`, `MenuHost.potting`/`setPotting`), `userSettings.potting` (an old saved value is ignored). Comments in `potting/potting.ts` updated.
- **Still to come** (unchanged): keeping pots between sessions (pots left out are lost when the game ends), and the propeller rule.
- **Tests:** tests/menu.test.ts's host without the two entries; the full suite.
- **Not checked:** on the Quest.

### (From the modular-builder chat) The driving keys run straight through neutral (29 Oct 2026)

On the owner's word ("full forward, full reverse without it stopping at neutral"): holding a throttle key no longer stops at neutral. Changed: `App.handleDebugDriving` (single lever and the twin E/D, R/F keys) and `Tiller.tick`, both now behind a new setting `CONFIG.debugDriving.stopAtNeutral` (false; true gives the old stop). `tests/tiller.test.ts` updated. Full write-up in `docs/progress/modules.md`.

### The planning chart's layers; the stern trawler's fuel tanks (29 Oct 2026)

Owner: "they don't show the fishing areas or the lobster pot areas or the wrecks. It'd be good to have a button that turns those layers on and off, or maybe it's a level of detail." And: "the main big trawler ... the fuel tank seems to be small. It's only got 52 nautical miles range."

- **The working layers** (`voyage/planChart.ts`, `paint(..., layers)`): the fishing grounds (dashed green rings, "(fish)"), the pot grounds (hatched orange, "(pots)", always, not only with potting on as on the plotter) and the dive wrecks (dashed blue, "Wreck, 40 m", or her found name), as the chartplotter shows them. Their rings at any zoom; their names closer in than `chart.layerNamesSpan` (12 km) and only where they keep clear of the names already on (a level of detail of their own).
- **On and off:** a **LAYERS** key on the pads (`chartPad.ts`: the board, the quay table and stand, the chart table's PLAN sheet; lit while on) and a **Layers: on/off** button on the desktop chart (`ui/planChartPanel.ts`). On to start with; each chart's own. Not on the plotter's PLAN screen (its keys are few; its own picture shows these already).
- **The stern trawler's tanks** (`shipyard/parts/engineRoom.ts`, `catalog.ts` `fuelAtM`, `CONFIG.shipyard.sternTrawler.fuelL` 18000): a fishing vessel's, 18,000 L at 20 m growing as the cube of her length (9,200 L at 16 m, about 29,000 at 23.5 m), instead of the small boats' litre a kW (850 L with the 750 kW engine: the 52 nm). Half her tanks weigh in as before (about 7.5 t more at 20 m: 140 t). The dive ship, on her hull, gets them too.
- **Her price:** the Shipyard prices her at £250,000 to £600,000 as she's built (£596,000 as she comes). A career purchase is the refit's difference from the boat you have (`app/shipyardTrip.ts` `refitCost`), so from one trawler to another it can be small: that's likely the £45,000. Not changed.
- **Tests:** the Shipyard's and the trawler's (480) pass with the bigger tanks.
- **Checked headless:** the chart round Calder at 14 km (rings only) and 6 km (named, clear of each other).
- **Not checked:** on the Quest; her range on the Shipyard page (worked out from your 52 nm on 850 L: about 1,100 nm flat out).
- **Changes in another area's files:** `src/shipyard/parts/engineRoom.ts`, `src/shipyard/parts/catalog.ts`, `src/config/shipyard.ts` (the trawler's tanks).

### The planning chart in a paper chart's colours (29 Oct 2026)

Owner: "I'd like the coloring of the charts to retain that original pale yellow and blue color like you have in the Admiralty chart in the UK."

- **Admiralty colours** (`nav/landLayer.ts` `PAPER_CHART`; the land layer now takes a palette, the plotter's own picture keeping `SCREEN_CHART`): deep water white, the shallows pale blue, the foreshore a darker buff, the land pale yellow buff.
- **Its inks** (`voyage/planChart.ts`): black lettering for harbours, towns and islands, sloping blue for the waters, the landmarks' rings and the scale bar and north in black, the route a chart's magenta, things to look at a darker teal, your boat amber with YOU in brown, the crew's blue. The pads' top line is pale with magenta lettering (`voyage/chartPad.ts`).
- **Where:** everywhere the planning chart is: the desktop's full-screen chart (M), the board in the hand, the quay table and stand, the chart table's PLAN sheet, the plotter's PLAN mode. The plotter's own picture stays a dark screen.
- **Checked headless:** the career chart close up; the Oban quay table.
- **Not checked:** on the Quest; at night (the quay table is a lit screen, so it shows bright at night).

### Look at: on a landmark, off the route, called out in sight (29 Oct 2026)

Owner, trying the planning chart: "the look function just did the same as waypoints"; then "go ahead with all three for Look" (snap to the landmark; not on the route; a call when it comes in sight).

- **On its landmark** (`voyage/plan.ts` `lookTarget`, `lookReach`): a Look press goes onto the nearest named castle, monument, tower, hill, wreck or light within `lookShare` (0.06) of the chart's width (200 m at least, `nameLookM` 2500 m at most), and takes its name. Nothing there: no point, and the chart says so for a few seconds (`planChart.ts` `NOTHING_TO_LOOK_AT`; `toolIntent` returns null; the desktop panel's foot, the pads' top line). The host checks again (the `add:look` intent carries the reach).
- **Off the route:** `nextPoint` passes over things to look at, so the chartplotter never steers for one and reaching the route's points ignores them. The planning chart and the plotter join only the waypoints and stops; a look is a teal diamond on its own, grey with "(seen)" once seen.
- **Called out in sight** (`stepPlan`, `sightWords`): when any player's boat comes within `reach.look` (now 2000 m, was 900) of an unseen one, it's seen, and everyone gets a note of where it is from her: "Look 2: Margaret Ann in sight: on the port bow, 0.5 nm" (dead ahead, bow, abeam, quarter, astern; "from Bosun's boat" with more than one boat). One a tick. `seen` is saved with the plan.
- **The landmarks on the chart:** small pale rings closer in than `chart.sightsSpan` (30 km), named closer than `chart.sightNamesSpan` (9 km), so you can see what there is to look at (`lookSights`, cached).
- **Wording:** a plan with only things to look at says "No route yet" rather than "done".
- **Config:** `CONFIG.voyage.plan.lookShare`, `reach.look` 2000, `chart.sightsSpan`, `chart.sightNamesSpan`.
- **Tests:** tests/voyagePlan.test.ts: a look goes onto the wreck (and none in open water), the route passes over it, it's called out on the port bow at 0.5 nm once, `seen` saved; `sightWords` ahead, abeam, quarter, astern. tests/planChart.test.ts: `toolIntent` may now be null.
- **Checked headless:** the workboat's leaf with a waypoint, a look on the Margaret Ann and a stop (the route 1 to 3 past it; the callout on screen); the chart close up.
- **Not checked:** on the Quest.

### The planning chart on the quay and on the boat: steps 2 and 3 (29 Oct 2026)

Owner: "go ahead with steps 2 and 3" of the planning chart plan: the quay table made reliable (at whichever harbour the players are at, a smaller stand where there's no room, never taking the Shipyard sign down with it, each player's own zoom and pan), the drop-leaf chart table showing the planning chart on its leaf, and a PLAN button on the chartplotter ("drag on it to look away from your boat, tap to add a point").

- **One planning chart on any surface** (new `src/voyage/chartPad.ts`, `ChartPad`): a canvas with the chart (`PlanChartPainter`, as before) over a strip of keys, and the pointer logic: a press let go puts a point or presses a key, held and moved drags the chart (the spot pressed stays under the pointer), a zoom keeps the spot pointed at. Each one keeps this page's own view; only the points are sent (the `plan` intent). `PadFaces` works the pads' pictures in the world: a VR hand's ray (its trigger; the right thumbstick zooms; the grip and the left stick stay free, for walking up to it) or the desktop reticle (click, drag by looking round, the mouse wheel). The chart board in the hand (`player/chartBoard.ts`) now uses a pad too (no change to how it works).
- **The quay table** (`voyage/planTable.ts`, rewritten): no longer the paper chart with one shared view and step zoom, but the planning chart set into its top (a lit screen), each player's own view. Its keys: WAY STOP LOOK DEL UNDO CLEAR BOAT ALL − +.
  - **At the harbour you're at** (`voyage/plan.ts` `tableBerthNear`): each page puts it at the harbour nearest its player (a harbour with a berth, not a fish farm's feed barge; at the map's start harbour, by the start's own berth), held until another harbour is `table.harbourHoldM` (150 m) nearer. It no longer follows the host's Go (`tableFollows` and the plan's `harbour` are gone; an old save's `harbour` is ignored). **Go to the table** lands you by the table at the harbour nearest you.
  - **The stand** where the table won't fit: `planTableSpot` now takes a footprint; the table's tried first, then the stand's (`table.stand`: 1.0 × 0.8 m on the ground, a 0.9 m chart tilted 25° up toward you, its near edge 1 m up). Each harbour's spot is looked for once and kept. The table and the stand share one picture.
  - **The Shipyard sign and Your boats board** are made in Voyage whether or not a table fits (the bug: no table, no signs), and stand beside the table or stand, or on their own at the spot ashore where neither fits (`ShipyardDoor.update` takes the half width).
  - Every career harbour fits a table (test); on Oban and Tayvallich every harbour does too (headless check: 8 and 4 harbours, each spot found in under 5 ms).
- **The chart table's PLAN sheet** (`vessel/view/chartTable.ts`): the rack's last "sheet" is the planning chart, on the leaf (its own pad, the leaf's shape). While it's out the pencil and its marks are put by (they're the paper's); press the rack on round to the paper charts. Lit as the paper is (dim and red at night).
- **The chartplotter's PLAN key** (`nav/chartPlotter.ts`): a key at the right end of the zoom strip turns the screen to the planning chart, round your boat at the range it showed, keys WAY STOP LOOK DEL UNDO; drag to look round, press to put a point. In PLAN, − and + zoom the planning chart and AUTO puts your boat back in the middle (they send the boat's range back unchanged). Dark with no power, as before. This page's own.
- **Desktop mouse wheel** (`app/desktopPointer.ts`): its notches are passed to the chart hook (`wheel`).
- **Config:** `CONFIG.voyage.plan.table` (`reach` 3, `px` 1536, `redrawS` 0.12, `toolbarShare` 0.1, `harbourHoldM` 150, `stand`), `CONFIG.voyage.plan.chart.startSpan` 6000, `chart.leaf` (`px` 1280, `reach` 1.6), `chart.plotter` (`px` 768, `reach` 1.6). `plan.drawPx` and `table.keyDepth` went with the paper table.
- **Tidied:** `Control.pressPoint` (only the old table read it) and its setters in `InteractionSystem` are gone. The plan's shared `view` and its `zoom`/`out`/`whole` intents are left in place (nothing sends them now).
- **Draw calls:** the table or stand is its frame and its chart (two), as before less the route sheet, the boat arrows and ten keys; the plotter's PLAN key is one.
- **Tests:** new tests/chartPad.test.ts (a press puts a point with the tool, keys, CLEAR twice; a drag keeps the spot under the pointer and sends nothing; zoom keeps the spot; BOAT; every career harbour gets a table, never a feed barge). tests/voyagePlan.test.ts: the table's harbour nearest you, held, and Go to the table from your boat at another harbour.
- **Checked headless:** the table at Tayvallich and Oban with points put through its pad and the reticle's hit; the stand (made in the table's place for a look); the workboat's leaf on the PLAN sheet and her plotter in PLAN.
- **Not checked:** on the Quest (the hands' rays on the table, the leaf and the plotter); a harbour where only the stand fits, or neither (none on the maps I tried).
- **Shared changes:** `src/vessel/view/chartTable.ts` (the PLAN sheet), `src/core/simulation.ts` (the Go no longer moves the table), `src/controls/Control.ts` and `InteractionSystem.ts` (`pressPoint` removed).
- **Changes in another area's files:** `src/modules/chartplotter/index.ts` (the PLAN key among its controls).

### The crew area: flickering floors fixed, a stair you can walk (29 Oct 2026)

Owner, trying it on desktop: "a bunch of Zed fighting, mostly on the floors", "I wasn't able to go down the stairs", "stairs have a very narrow passage ... I don't know why the collision should just be a plane. You shouldn't consider the railing at all ... real problems at the top of the stair", "be good to see an image of the collision physics".
- **The floors** (`crew/view.ts`): cutting the stair's hole out of the main floor let the lobby's matting run on forward over the vinyl, two floors in one place: the hole now stays within each sheet. The smaller coplanar spots fixed too:
  - the stair well's linings ran into the floor and the deckhead;
  - the worktop over the sink (now in runs round the cooker and sink);
  - the bunk's base against its end boards;
  - the table's rails at its corners;
  - the shower's back wall;
  - the skirting where its runs meet (each a little different in height).
- **The stair is a slope** (`crew/walk.ts`): walked as one plane from the main floor at its head down to the lower floor a tread beyond its foot, just over the treads' nosings, across its whole width between its walls. The handrails are only drawn. No more settling from tread to tread, so no catch at the top.
- **Wider**: the stair `CONFIG.crewArea.stair.width` 0.9 → 1.1 m (the corridor and trunk with it). Doorways 0.75 → 0.85 m. The body kept 0.15 m off walls and furniture, not 0.22 (passing a doorway you had to be within 0.3 m of its middle; now 0.55).
- **A picture of the walking** (headless, sent to the owner): each deck in plan, where you can stand, what's blocked, the stair's slope, and the stair from the side with the slope against the treads.
- **Tests:** tests/crewArea.test.ts now walks down the slope 5 cm at a time with no step, across it at x −0.4, 0 and 0.4. Doorways are passed 0.25 m off their middle. The stair is at least 1 m wide.
- **Checked headless:** walking in from the door with W through the mess doorway well off its middle; the floors from the passage and the messroom; the picture.
- **Not checked:** on the Quest.

### The harbour tug's crew area, first draft: two decks, loaded as its own space (29 Oct 2026)

Owner, on the modular-builder chat's handover (below): "You can do the first draft of the interior. I think two decks, if you can make it work." It works: both decks.
- **The go-below system, now spaces** (`src/app/engineRoom/index.ts`):
  - `BelowDecks` holds one space at a time: `'engine'` (the engine room, as before) or `'crew'` (new). Each boat's drawings are kept per space (`boat:space`), each its own download.
  - `space` and `wayOut` are exposed: the guard texts are now generic ("Inside: go out by the door aft").
  - `crewAreaFor`, `crewLayoutFor` and `inCrewArea` are cached per type, like `roomFor`.
  - `goInside(boatId)` goes in; `goUp()` comes out of either space (from the crew area, on deck a step aft of the door).
- **Where it fits** (`crew/plan.ts`, `CONFIG.crewArea`):
  - **Main deck**: inside her deckhouse's walls (`main.wall`), its floor level at her highest deck under the house, its deckhead `deckheadDrop` under the house's top. At least `minLength` 4.5 × `minWidth` 4 m with `minHeadroom` 2 m; a boat at least `minLoaM` 20 m.
  - **Lower deck**: forward of the engine room's forward bulkhead, `forepeakShare` of her length back from her stem (moved aft until her hull's `minHalf` wide at the sole). Its deckhead `deckDrop` under her lowest deck over it, `headroom` 2 m, `lining` in from her plating.
  - **The stair**: on her centreline, its head at the aft end of the two decks' overlap; steps of at most `maxRise`, treads `tread` (down to `minTread`, a ship's stair).
  - **The door**: in the house's aft face, on the side away from the outside stair up to its top.
  - The harbour tug: main deck 8.5 × 6.6 m with 2.15 m headroom; lower deck 6.8 × 7.4 m with 2 m; 12 steps of 0.22 m. The stern trawler (no deckhouse) and the fleet have none.
- **The layout** (`crew/layout.ts`; our own arrangement, fitted to her house):
  - **Main deck**:
    - the **lobby** aft: boot rack, oilskins on their hooks, the lifejacket locker, a fire extinguisher by the door, the muster list;
    - doorways forward into the **messroom** to port: a U-settee round a fixed table with a fiddle rail, mugs and the paper, the TV, a harbour chart;
    - the **galley** to starboard: worktops along her side and forward, the cooker with its fiddle rail, hood and kettle, the sink, a tall fridge, lockers over the windows;
    - the **stair** between them.
  - **Lower deck**:
    - a corridor across her at the stair's foot;
    - aft of it the **master's cabin** (bunk, desk with laptop and lamp, chair, wardrobe) and the **crew cabin** (two-high bunks with a ladder, two lockers, a seat);
    - forward of it the **washroom** (shower, WC, basin and mirror) and the **laundry and store** (washer and dryer, shelves of stores, a mop and bucket).
  - Doorways with frames and open doors, name plates beside them. Windows along the main deck's sides and front; portholes on the lower deck.
- **Walking** (`crew/walk.ts`): the floors overlap in plan (the cabins are under the messroom): which one by your height. The stair's treads are floors a step apart, and the main floor has a hole over them. Partitions and furniture are solid; in VR a head leaned into them fades the view.
- **The drawing** (`crew/view.ts`, `CONFIG.crewArea.look`): one merged painted mesh (render linings, perforated cladding overhead, matting, vinyl and carpet underfoot, wood joinery, woven upholstery), one unlit mesh (windows' daylight, portholes, ceiling lights, mirror), one canvas (the plates, an original harbour chart, the muster list in her name). A soft fill and three lamps moved to the ceiling lights nearest you on your deck. The berths are the furniture's `BerthRest`: lie down to rest.
- **In and out** (`player/gangway.ts`, `CONFIG.gangway.doorRange` 2.2 m): "Go inside" on her deck aft of the door (not from the side deck or the house top), "Go outside" by it inside.
- **App:**
  - a crew-mate inside with you stays drawn (`inCrewArea`);
  - the wind, race and surf sounds are muffled as in a shut wheelhouse;
  - the engine is heard as from inside her house, not as in the engine room;
  - the jump and board keys say the way out.
- **Tests:** tests/crewArea.test.ts (4):
  - the tug has both decks, inside her house and forward of her engine room, the door clear of the outside stair; no other boat has one;
  - the stair joins the decks a step at a time;
  - every room has its things, nothing in a wall or another thing;
  - walking in at the door, through every doorway, down every tread; walls solid, under the stair closed.
- **Checked headless** (the tug on the Oban map):
  - "Go inside" shows on deck by the door;
  - every room shot;
  - walked with W held from the lobby through the corridor, down the stair and onto the lower deck's corridor (about 3 s);
  - "Go outside" puts you on deck;
  - 4–6 draw calls and about 9,000 triangles inside, against 70 and 450,000 on her deck.
- **Not checked:** on the Quest (frame rate inside, the stair in VR, lying in a bunk); a crew-mate inside in multiplayer.
- **Not yet:** the view out of the windows (they show daylight); doors you open and shut; a door from the lower deck into the engine room; going up to the bridge from inside.

### Longlining, step 2: the line hauler (29 Oct 2026)

Owner: "go ahead with the line hauler". A powered sheave at the starboard rail, so a 300 m line isn't all hauled by hand; built as a module and a Shipyard choice, the way the trawl deck gear was, and fitted to the beginner boat by the yard, as the bow fender is.
- **The module** (`src/modules/lineHauler/`, `deck.line-hauler`, `CONFIG.modules.lineHauler`): a post on deck against the starboard bulwark; a davit arm out over the rail to a roller (the line's lead); the sheave on the post's top, its axle fore and aft, its motor forward of it; a bin on deck inboard of it for the line; and its **valve**, a three-way knob (STOP / SLOW / FAST, the foiling ferry's `Selector3`) on a bracket aft of the post. Static parts merged with her others; the sheave (turning with `hauler.run`) and the line round it (shown with `hauler.line`) are its two moving parts. It needs deck hydraulics, and provides gear `lineHauler` (its roller, sheave, bin and valve).
- **The hauling** (`fishing/longline.ts`, `CONFIG.longline.hauler` `slow` 0.5, `fast` 1.0 m/s):
  - A dan buoy brought aboard a boat with a hauler leads its line over the roller (the lead) and round the sheave (`haul.hauler`).
  - The valve's speed (0 at STOP or without hydraulic pressure) brings up a hook every `hookSpacingM`.
  - It's held with a fish at the roller, and while she's further off the line than the depth + `leadSlackM` (it won't come, as by hand). It goes on by itself once it can. Parting is as before.
  - Its progress is kept as a speed since a time (`haul.drive`), rewritten only when the speed changes or a hook comes up, so the line isn't sent to the crew every tick.
  - By hand: nothing, while it's round the hauler.
  - Each boat's hauler (`VesselState.hauler`: how fast it turns, a line round it, held) is set when it changes. Spinning free with its valve open and no line.
- **The hands** (`longlineHands.ts`): the dan buoy aboard says the line's round the hauler and to set its valve. A grip or click on the line says its valve hauls it. The crew say why it isn't turning: no pressure (engine and DECK HYD), or off the line.
- **The sound**: a `hauler` voice in the deck hydraulics (`audio/hydraulicsAudio.ts`), a lighter whine than the winch. Turning with the line, the relief valve's hiss while it's held with its valve open.
- **The Shipyard** (`design.lineHauler`, not in the short code: a boat with one travels as a link or file):
  - Placed against her starboard bulwark at the forward end of the aft deck (`CONFIG.shipyard.deckGear.lineHauler`: `fromHouse` 0.4 m aft of the house, moved aft until clear, at most `search` 4 m, with `room` to stand). Placed before the fender basket.
  - In her recipe with a hydraulic pump. Deck gear → Fishing, "fitted" (pin how `rail`), with its icon and line.
  - 90 kg; £6,500 (`weights.gear.lineHauler`, `deckGear.price.lineHauler`).
- **The yard** (`CONFIG.career.upgrades` 'lineHauler', £1,500, rep 0): the beginner boat's design with one. Sold at Calder Haven. The old workboat can't take it.
- **Tests:** tests/lineHauler.test.ts (4):
  - the Shipyard places it, with a pump;
  - the yard sells and fits it (not on the old workboat), its roller over her starboard rail;
  - a dan buoy aboard leads round it, by hand nothing, STOP nothing, SLOW hauls the whole line, held at each fish till taken off, the tub back on deck;
  - FAST twice as quick, no pressure no turning, off the line held, spinning free without a line.

  Also updated: the add-on lists (starterWorkboat), the gear menu and pin lists, the fields not in the code (designDoc), the bus key table (docs/BUS_KEYS.md). The hauler's keys exist only on a boat with one, so the golden runs are unchanged.
- **Checked headless:** bought at the Calder yard in a fresh career (the game restarts in her refitted); the hauler at her starboard rail; at sea with a line round it, a haddock held at the roller, the line over the sheave into the bin, the valve on SLOW.
- **Not checked:** on the Quest (the valve's size and reach, hauling with the other hand free); the sound by ear; a whole line hauled in the game under power (the test does it).
- **Shared changes:**
  - `src/vessel/vesselState.ts` (`controls.haulerValve`, `hauler`);
  - `src/modular/busKeys.ts` (`hauler.valve`, `hauler.run`, `hauler.line`, only on a boat with one);
  - `src/modular/module.ts` (gear kind `lineHauler`);
  - `src/modular/recipe.ts` (its words);
  - `src/boats/library.ts` (the module registered);
  - `docs/BUS_KEYS.md` (regenerated).
- **Changes in another area's files:**
  - the Modular builder's `src/modules/lineHauler/` (new) and `src/config/modules.ts` (`lineHauler`);
  - the Shipyard's `design.ts`, `gearMenu.ts`, `pinGear.ts`, `parts/deckGear.ts`, `parts/engineRoom.ts` (the pump's socket), `parts/recipe.ts`, `parts/weights.ts`, and `src/config/shipyard.ts`;
  - the Map's `src/world/regions/home.ts` (Calder Haven's yard sells it).
- **Still to come (if wanted):** the hauler for the pots too (the same sheave hauls a pot line); bait and baiting tubs; snagging on rough ground.

### Longlining, step 1: shoot, soak, haul by hand, and a catch you can read (29 Oct 2026)

Owner: "go ahead with longlining", and earlier "I'd like a variety of fish and fish sizes coming up so you know how good your catch is". Everything works alone; with crew one drives and one hauls.
- **Line tubs** (new cargo kind 'Line tub', 32 kg, one hand, `CONFIG.cargo.kinds`): ordered at any harbour's cargo screen (a new **Line tubs** row, `cargo/order.ts` sort 'tubs'), from 'tubs' to 'none'. At most `CONFIG.longline.maxLines` 4 in play (tubs, lines shooting and lines down: `linesInPlay`). Load lists them (`quickLoadable`); they don't count as goods waiting for another port.
- **Shooting** (`fishing/longline.ts`, `CONFIG.longline`): a tub let go in the sea from a boat (`cargoPlace` or the crane's `setDown`) starts its line: the first dan buoy goes in there, and the groundline pays out along her stern's track as she steams, a hook every `hookSpacingM` 6 m. All `lengthM` 300 m out, the far buoy goes in; stopped (under `stopSpeed` 0.5 m/s) for `stopS` 30 s, it goes in where she is (under `minM` 40 m the line is lost). **How well it's shot** is how well it fishes: quality = straightness² × a speed factor (full within `goodSpeed` 1.5-4 m/s, 3-8 kn; down to `worstSpeedFactor` 0.55 outside).
- **Soak:** worth hauling after `soakReady` 900 s, best at `soakBest` 1800 s (play time).
- **Hauling** (`fishing/longlineHands.ts`, the pots' pattern, their helpers now exported from `potting.ts`): hook either dan buoy with the boat hook (`llHook`), draw it alongside (`llTow`, within depth + `danScopeM` 12 m of its anchor), bring it over the gunwale (`llAboard`, the lead from `leadFor`), then haul hand over hand (`llHaul`: VR pull × `pullScale`, up to `maxPull`; desktop `deskPull` 6 m a click). The line comes from its next stretch on the bottom: more than depth + `leadSlackM` 14 m off it and it won't come; more than depth + `partM` 40 m and it **parts** (that end's buoy is gone, and the rest is hauled from the other end). All in, it goes back into its tub on her deck, to shoot again.
- **The catch** (`fishOnHook`, seeded by line and hook, so everyone sees the same fish): each hook has a fish at `hookRate` 0.32 × the ground's richness (`offGround` 0.25 off any ground) × soak × quality. Eleven species (`CONFIG.longline.species`: cod, haddock, whiting, ling, hake, pollack, halibut, conger eel, thornback ray, dogfish, mackerel; each with a weight in the mix, a size range, a minimum landing size, a price per kg and a colour). The ground's own fish (`groundSpecies`, from its trawl species) weighs `groundBoost` 4× in the mix; dogfish double off any ground. Weight: min + (max − min) × r^`sizeSkew` 2.2, so most are small and a few big. Each is called **undersize, small, fair, good or big** for its kind (`sizeWord`).
- **Taking it off** (`llTake`): the line stops with each fish at the rail, drawn in its colour and to its size (`fishing/longlineView.ts`), swung up with its head over the rail (`FISH_HANG`). The crew call it out ("Cod, 4.2 kg: a good one"). Taken off, it goes into a **fish box** on deck (up to `boxKg` 25 kg a box), or back over the side if undersize. At the end, the haul's tally: count, kilos and best fish of each kind.
- **Selling:** the boxes (from 'line', each listing its fish) land at any harbour (`retire`): by the kilo, by species (`longlineBoxValue`), × the ice machine's factor, as fish earnings.
- **Duty board:** "Longline: n lines in the water", with shooting, ready-in, hauling and landing steps.
- **Drawn:** dan buoys (one instanced mesh, up to 24, within 1.5 km), a line off the transom while shooting and over the gunwale while hauling (one LineSegments), one small mesh for a fish on the hook. About 3 draw calls in all.
- **Tests:** tests/longline.test.ts (7): ordering up to the limit; shooting (buoys, hooks, quality over 0.9 when straight and steady); stopped part way, a shorter line; the catch on Calder Bank (haddock most, at least six species, every size word, fewer big than small, an unsoaked line catches less); a whole haul taken off into boxes of at most 25 kg, with a tally and the tub back on deck; off the line it won't come, driven off it parts, then hauled from the other end; boxes sold by the kilo.
- **Checked headless:** two tubs ordered at Calder Haven's cargo screen (the Line tubs row, the tubs on the quay); a soaked line's dan buoy on Calder Bank; a cod on the hook at the starboard rail, from the water and from the aft deck. That check caught a drawing bug (the fish drawn hundreds of metres off the boat) and fish hanging out of sight below the bulwark; both fixed.
- **Not checked:** on the Quest; a whole line shot and hauled under power in the game, by hand (the tests drive the intents and place her).
- **Shared changes:** `src/core/simulation.ts` (routes the longline intents, steps the lines); `src/core/world.ts` (`WorldState.longline`); `src/potting/potting.ts` exports `leadFor`, `fromHull`, `outsideHull`, `toWorldPt`.
- **Still to come (if wanted):** a line hauler on the rail (a powered sheave instead of hands), bait and baiting tubs ashore, hazards (snagging on rough ground, gear conflicts with the trawl and pots).

### Fish farm service, step 3: crew changes and the Tarsk mussel lines (29 Oct 2026)

Owner: "carry on with farm step 3".
- **The crew change** (`aqua/farmCrew.ts`, `CONFIG.aqua.crew`): a fourth farm call, every 40-60 min (first after about 20), due in an hour.
  - `people` 2-3 of the day shift wait on the farm's **shore base** quay (`farmBase`: the sheltered harbour nearest its barge, Loch Tarsk for the Tarsk farm), and as many of the night shift on the barge.
  - A boat **stopped at either** (the quick jobs' `quickPort`: within the berth, barely moving) lets one off or takes one aboard every `boardS` 2.5 s: at the base the day shift boards and the night shift goes home; at the barge the day shift steps off and the night shift boards. Either way round. Seats: the wind farm's `seatFor` (now exported).
  - Done: `trip` £200 + `perPerson` £60 each, and a job toward a farm service contract. Past due they find another boat.
  - **Drawn** (`aqua/farmCrewView.ts`): the wind farm's technician figures (`technicianFigure`, split out of transferView.ts), standing in a row along the berth on the quay or the barge, or seated aboard in her frame.
- **The Tarsk mussel lines** (`src/world/regions/sounds.ts`, the Map area's: two 110 m long-lines along Loch Tarsk's north side, z -4050 and -4040, x 690-800, in 8-9 m, clear of the channel to the quay; `FarmDef.base` 'tarsk', new: the harbour whose buyer takes them) and their harvest (`aqua/mussels.ts`, `CONFIG.aqua.mussels`):
  - Every 40-60 min (first after about 25): `bags` 6-10 **Mussel bags** (new kind, 40 kg, one hand, drawn woven) hung on the lines (`bagPlaces`, every `bagSpacing` 9 m), bound for Loch Tarsk, from `mussels` (not a port: nothing restocks or counts them).
  - Lifted aboard (by hand or the crane) and landed at Loch Tarsk (`musselsLanded`, in retire beside the feed and the morts): `perBag` £45; all in, `bonus` £300. Past due (an hour) the rest go.
  - On the duty board when no fish farm is calling; on Loch Tarsk's cargo screen's farm line.
- **Tests:** tests/farmStep3.test.ts (6): the shore base and where the people stand; the whole crew change round, paid and counted toward a contract; past due; the lines in water and their bag places on solid line; a harvest lifted and landed, paid by the bag and the bonus; past due, the bags go.
- **Checked headless:** the day shift on the Loch Tarsk quay, two seated aboard the gillnetter after lying alongside; the mussel lines with ten bags on them.
- **Not checked:** on the Quest; a whole crew change driven under power in the game (the tests place her).
- **Changes in another area's files:** `src/world/regions/sounds.ts` (the mussel lines). **Shared changes:** `src/world/defs.ts` (`FarmDef.base`); `src/transfer/transfer.ts` and `transferView.ts` export `seatFor` and `technicianFigure`.
- **Still to come for the farms (if wanted):** the coast maps' farms in Voyage (they have no barges yet).

### The career's World tab: passages to each region's harbour, for the time and the fuel (29 Oct 2026)

Owner: "the career map's now quite big ... a world tab, so not under debug, and you can teleport to the sheltered harbor with the pier in any one of the regions, and it only costs you time and the fuel to do that" (Voyage's Go is free, in its ports list).
- **The World tab** (`ui/mainMenu.ts`, career only; Voyage keeps its Go): her cruise, then each region's harbour (`PASSAGE_PORTS`: the region's port of kind `harbour`: Calder Haven, Loch Tarsk, Kvassvik, Ashby Cannery) with how far, how long and how much fuel, and **Go** (or why not).
- **The passage** (`career/passage.ts`, `CONFIG.passage`):
  - **Her cruise:** measured on her, `lever` 0.75 ahead in calm water until steady (`seaTrials.measureCruise`, new: a fraction of a second; kept per boat type, measured just after it's first asked for so the menu isn't held up). The starter gillnetter: 7.3 kn, 18 L/h.
  - **Distance:** the straight line to the harbour's cargo berth times `routeFactor` 1.3 (the water's way round the headlands). **Time** at her cruise; **fuel** at her cruise burn for that long.
  - **Made** (`passageToPort`, host only; args the time and fuel from the host's menu): the fuel comes out of her tank, the game's clock and the time played go on by the passage (the tick count, so contracts, pots' soak, farm silos and salmon freshness all feel it), and she's put at the harbour as Go puts her (cargo berth, neutral, lines off; you aboard with her).
  - **Not:** where she is already (within `hereM` 400 m), with a tow fast, without the fuel; a crew-mate's menu says Host only.
- **Tests:** tests/passage.test.ts (5): one harbour a region; her cruise measured; the plan's distance, time and fuel; made, the clocks go on, the fuel's burnt, she lies at Loch Tarsk's berth in neutral; refused without the fuel, with a tow fast, where she is. The menu test's host gains the passage calls.
- **Checked headless:** the World tab in a new career (Calder Haven "she's here"; Loch Tarsk 3.2 nm, 27 min, 8 L; Kvassvik 7.2 nm, 59 min, 18 L; Ashby 6.8 nm, 56 min, 17 L), and Go to Loch Tarsk: 8 L burnt, the clock 10:30 to 10:57, her at the cargo berth with me aboard.
- **Not checked:** on the Quest; a boat with an electric outboard (its battery isn't charged for the passage; no career boat has one).
- **Shared changes:** `src/core/simulation.ts` (the passage intent beside Go's), `src/vessel/seaTrials.ts` (`measureCruise`).

### Fish farm service, milestone 2: net checks, torn nets, morts, the farm service contract (29 Oct 2026)

Owner: "carry on with farm step 2".
- **The net check** (`aqua/netCheck.ts`, `CONFIG.aqua.check`): a third farm call (after feed and harvest), every `every` 30-50 min (first after about 15), due in `dueS` 40 min.
  - **Checking:** a boat with someone aboard, her hull within `reachM` 3.5 m of a ring's float and moving under `maxSpeed` 0.8 m/s, holds there `holdS` 8 s: the ring's checked (`payPerRing` £40). Each crew-mate aboard after the first adds `crewRate` 0.5 to the pace.
  - **A torn net** (`holeChance` 60 %) on one ring, found when it's checked (VHF). While it's open, Crates at the barge's cargo screen are **Net patches** (new kind, 15 kg, bound nowhere so quick loading takes them); one set down (by hand, `cargoPlace`, or a crane, `setDown`) within `patchReachM` 2.5 m of its flag mends it (`patchNet`, `mendPay` £250) and is used up.
  - **Morts** (`mortChance` 60 %): a **Mort bag** (new kind, 70 kg, two hands) on one ring's walkway from the call; landed on the barge (by hand, crane or Unload) it pays `mortPay` £120 (`mortLanded`, in cargo.ts retire beside the feed).
  - **Done** (every ring, the hole, the morts): `bonus` £250. Past due, the call goes, and an unlanded bag with it.
  - **Where on a ring** (`ringPoint`): on its outer float pipe (`onRingOut` 0.8 m beyond its radius: worldView.ts draws the pipe at the radius and the outer one 0.9 m out), on the diagonal facing away from the farm's middle. A boat stops against a ring at its collision square (world/farms.ts, 0.8 of the radius each side), whose corners reach past the outer pipe on the diagonals, so there the bag and the flag are within arm's reach of her gunwale, and over solid ring (set down there, things stay).
- **The flags** (`aqua/aquaView.ts`): a 2.6 m pole and a big flag on each ring while a check is going: yellow to check, green checked, red at a found torn net. One instanced mesh for every flag (one draw call), only within 900 m.
- **The farm service contract:** a fourth contract kind, `farm` (`CONFIG.career.contracts.kinds.farm`: 1-3 calls, £300 each, 45 min each), offered only at a farm's feed barge (and only that there). A call seen through counts (`countContract`, split out of `earn`): a feed call filled by someone's feed, a harvest landed fresh, a net check done.
- **The duty board** shows the check (rings checked of all, the hole once found, the morts); a job duty's step words now follow the world (`syncJob`), so counts go up as you work.
- **The cargo screen's** farm line at the barge: "Net check: 2/6 cages · hole at cage 4 (Crates are net patches) · morts on cage 5".
- **Tests:** tests/netCheck.test.ts (6): a ring's bag and flag on its outer pipe over solid ring; held alongside, a ring's checked and paid, a second crew-mate checks quicker; a hole found, a patch from the barge set by its flag mends it; the morts landed and the last ring held: the check done, paid, and a farm contract completed; not done in time, the call and its morts go; the barge offers only farm contracts.
- **Checked headless:** a net check at the Tarsk farm from the air and close up: the yellow, green and red flags, a bag of morts on a ring's walkway, the gillnetter alongside.
- **Not checked:** on the Quest (reaching the bag from her gunwale, setting the patch down by the flag); bringing her alongside a ring under power in the game (the tests place her).
- **Next (step 3):** technicians to and from the barge, mussel lines, and the coast maps' farms in Voyage.

### Fish farm service, milestone 1: the Tarsk salmon farm, feed runs and harvest runs (29 Oct 2026)

Owner: "go ahead with fish farm service first, everything should be possible single player but better with crew" (step 1 of the fishing plan; longlining next, with "a variety of fish and fish sizes coming up so you know how good your catch is").
- **A farm near home** (`src/world/regions/sounds.ts`: home stays as it is, the regions brief): the **Tarsk salmon farm**, six cage rings (2 × 3, 32 m apart, 12 m rings) in 25-38 m off Tarsk's east shore north of the loch mouth, clear of the channel in (depths checked); its **feed barge** (a 24 × 10 m `barge` block, drawn with its house and silo), port `tarskfarm` (cargo berth on the barge's west face, the goods row on its open deck between house and silo, products Salmon box, needs Feed sack), a lamp and a floodlight. `FarmDef.port` (`src/world/defs.ts`) links a farm to its barge; the Kvass farm gets `port: 'kvassfarm'`.
- **The farm service** (`aqua/farmService.ts`, `CONFIG.aqua`; WorldState.aqua, stepped by the host; on in the game like the transfers, `createAqua(spawn)`, raised by hand in tests):
  - **The silo:** `siloKg` 3 t, the fish eat `eatKgPerS` 1 kg/s (3 t in about 50 min); a new game's farms start `startFill` 45-75 % full. Empty: hungry (told on the VHF once), and feed then pays `hungryFactor` 1.5.
  - **Feed call** under `callBelow` 40 %: on the VHF and the duty board. While it's on, the cargo screens make feed for the nearest calling farm: **Crates** at a harbour that makes feed (Garbh's Feed sacks, Ytterbrygga's Feed pellets) are feed bound for it; **Crane lifts** at any cargo quay are (within `serveRangeM` 6 km of the farm) **Feed bags** (a new crane-only kind, 500 kg, never made at random: `cargo.crane.orderOnly`; drawn as a woven sack) bound for it. Set down on the barge (by hand, crane or Unload), feed goes in the silo and pays `feedPerKg` £0.90 a kilo it takes (nothing for what a full silo can't). The call ends over `fullAt` 90 %.
  - **Harvest call** every `harvest.every` 25-40 min (first after about 10): `boxes` 6-10 boxes to a harbour (`harvest.to`, the nearest mostly). Crates at the barge are then Salmon boxes bound there, marked `bestBy` (`freshS` 25 min on ice); a box later pays less, to `staleFactor` 30 % at twice that (`freshFactor`, `EarnOpts.factor`). The whole run landed in time pays `bonus` £400.
  - Pay is a new job kind `farm` (career.ts; `rep.farm` 1).
  - The silo is kept as a level and the time it was set (`feedNow`, `setFeed`), not ticked down, so the farm state only changes when something happens: it isn't in every crew snapshot.
- **The cargo screen** gains a farm line: at a barge, its silo and the harvest run; elsewhere, a call this harbour can serve ("Tarsk salmon farm wants feed: Crates are feed sacks, Crane lifts are feed bags").
- **The duty board:** a farm duty for the first call going (fetch the feed / set it on the barge; order the salmon / land it while fresh).
- No Shipyard sign or boats board on a feed barge (`careerShipyardSpots`).
- **Tests updated** for the barge and the bag: the port list (regions), the Shipyard signs (not on a barge), Feed sacks bound for Loch Tarsk or the farm (sounds), heavy kinds (cargo).
- **Tests:** tests/farmService.test.ts (5): the farm's cages in deep water and a berth by the barge; the silo eats down, calls only in the game, on the VHF and the duty board; a feed call's sacks (Garbh) and bag (Loch Tarsk's crane) bound for the farm, landed, fill the silo and pay by the kilo; the call ends, an empty silo pays more; a harvest run's boxes bound for its harbour, a stale one pays less, the bonus for the run.
- **Checked headless:** the farm and barge from the air and alongside (the gillnetter at its berth); the barge's screen with a harvest call and four boxes ordered.
- **Not checked:** on the Quest; lifting a feed bag onto the barge with a deck crane in the game (the tests land it with Unload); walking the barge deck in VR.
- **Changes in another area's files:** the Map area's `src/world/regions/sounds.ts` (the farm, barge, port, berth, lamp, flood) and `fjord.ts` (the Kvass farm's `port`). **Shared changes:** `src/world/defs.ts` (`FarmDef.port`), `src/core/world.ts` and `src/core/simulation.ts` (the farm state and its step).
- **Next (milestone 2):** cage checks (nose onto a ring, a crew-mate on the walkway: a torn net to mend, a bag of dead fish to lift), technicians to and from the barge, mussel lines, a farm service contract.

### (From the modular-builder chat) HANDOVER: the harbour tug's crew area, a detailed interior loaded as its own space (first draft built 29 Oct 2026: see above)

The owner, 29 Oct 2026: "I'd like a detailed interior for the big tug's crew area, same treatment as the engine room, and it loads as a separate space", then, on who builds it: "Hand it all to main chat" (this chat owns the go-below system, `src/app/engineRoom/`, `src/player/gangway.ts`). Not started anywhere.

**What the go-below system needs first** (mapped by the modular-builder chat, 29 Oct; see `docs/ENGINE_ROOM.md` for its rules): today it is one space per boat, hard-wired to the engine room. `roomFor(defId)` gives one `EngineRoomPlan`; `BelowDecks` holds one `EngineRoomView` per boat; the gangway mark's `'below'` target is tied to `v.controls.engineHatch` and `room.hatch`; App's guard texts say "In the engine room"; `keptBelow()` decides who's below by `y < plan.deckhead`. For a second space: spaces keyed by (boat, space id), each with its box(es), its way in (here a door, not the hatch) and way out; `BelowDecks.here` carries the space id; the gangway finds each space's entry; the guard texts generic ("Inside: leave by the door"); and "who is in this space" by an x/z box as well as height, so a crew-mate in the engine room isn't drawn in the messroom. Reusable as is: the hide / restore of everything outside, the walk-area swap, the control lifecycle, the matrix follow, `Kit`, `look.ts` (`roomMaterial`, `grime`), pixel paint (add tiles for wood linings, vinyl deck, upholstery), the name-plate atlas (`tug/labels.ts`; `panel()` in `tug/room.ts` exported).

**The proposal the owner was given** (a real 25 m harbour tug's crew area, fitted to hers; ask the owner if both decks or only the main deck first: not answered yet):
- **Main deck, inside her deckhouse** (about 8 x 8 m under the bridge; Shipyard `HARBOUR_TUG_HOUSE`: `dhLength` 2.0 forward, `dhAft` 2.0, `dhWidth` 0.8, `dhHeight` 2.4 m; the deckhouse is the player's to reshape, so plan from the design's numbers, not fixed ones). In by a weathertight door in the deckhouse's aft face from the working deck (a "Go inside" mark there, like Go below). A **lobby** (boot rack, oilskin hooks, lifejacket locker); the **messroom** (a U-shaped settee round a fixed table, a TV, a harbour chart on the bulkhead); the **galley** (cooker with fiddle rails and extractor hood, sink, fridge, worktops, lockers over, kettle and mugs); a **stair down**.
- **Lower deck, forward of the engine room** under her main deck: a corridor; the **master's cabin** (single bunk, desk, locker, porthole); a **two-berth crew cabin**; a **washroom** (shower, WC, basin); a small **laundry and store**.
- **The engine room's treatment:** pixel-painted surfaces (wood-grain linings, vinyl deck, mattresses and upholstery), name plates on the doors (MASTER, CREW, WC, GALLEY, MESS), warm lighting, only the space drawn while you're inside, its code loaded the first time someone goes in.

### Square wire pots that stack on the quay and on deck (29 Oct 2026)

Owner (with a photo of wire lobster traps stacked on a quay): "I'd like the fishing pots to stack on the deck and quayside; they could be square if that helps."
- **Stacking** (`cargo/stack.ts`, `CONFIG.cargo.stacking`: kinds ['Pot'], `high` 3, `reach` 0.45 m):
  - An item set down on another of its kind rests on it: `at.on` (deck or ground) is that item's id, its base on the other's top, square with it.
  - **Placed** within `reach` of a stack with room (by hand, `cargoPlace`, on deck or ashore), it goes on top; quick stowing (`stowOnDeck`: Load pots) fills the stacks aboard first; pots ordered at the cargo screen stand in stacks on the quay.
  - **Taken:** only the top one (`takeBlocker` with the world: "Take the one on top first"); a deck crane lifts only the top one; Shoot one shoots the top of a stack; Load pots takes the tops first.
  - **Riding** (`followStacks`, each tick after the cranes): what's stacked rides on what's under it (place, yaw, sliding speed, lashing); deck sliding and bumping act on the bottom item only. Lashing any pot in a stack straps its bottom, so the stack as one.
  - **Falling:** if what an item stands on goes (over the rail, shot, sent back, onto another boat), it drops to the deck or the ground where it is.
  - The cargo screen's room count allows for stacking (a new stack leaves room for two more on it), so a full load of pots fills her stacks.
  - Stacked pots sit higher, so their weight raises her centre of gravity (the payload is by position, as before).
- **The pot** (`cargoView.ts potGeometry`): a square wire trap, original: green coated mesh on a frame, orange rope along the top edges, two dark runners, a mesh divider (kitchen and parlour), two net funnels in from the sides, a door with a bungee on top; its line coiled on one end and its buoy tied beside it, below the top, so the top is flat to stack on. Same size and weight as before (0.75 × 0.42 × 0.5 m, 24 kg). About 1,000 triangles a pot, one instanced draw for every pot. A lashed stack gets one set of straps over its whole height.
- **Tests:** tests/potStack.test.ts (6): ordered on the quay in stacks three high, square on each other; only the top one comes off; loaded aboard in stacks; set down by hand over a stack, on top; a stack rides and is lashed as one, and drops when its bottom pot goes; Shoot one takes the top.
- **Checked headless:** seven pots ordered at Calder Haven (stacks of three, three and one), and loaded onto the gillnetter's aft deck (two stacks of three and one), lashed.
- **Not checked:** on the Quest (picking the top pot off a stack by hand, setting one on top), and stacks sliding in a seaway.
- **Shared changes:** `src/core/simulation.ts` (followStacks each tick).

### The cargo screen: crates, crane lifts and pots ordered on the quay, sized to her (29 Oct 2026)

Owner: "it doesn't make sense to have the cargo crates on the side of the quay all the time. So I'd like another set of buttons or mini screen, which allows you to spawn cargo and lobster pots ... it tells you how many slots of cargo your ship has, which is docked at it. And it allows you to spawn individually or the maximum amount, and the same with lobster pots."
- **Goods on order** (`cargo/order.ts`, `CONFIG.cargo.onDemand` true):
  - The ports start empty and stay so: nothing is stocked at the start (`createWorld`), and nothing new appears when goods are delivered or lost (`retire`). Off, it's the old way (every port kept stocked).
  - **The pot pallet** at Calder Haven isn't stocked either (`stockPallet` does nothing with it on). Pots come from the screen, at any harbour, up to `potting.pots` (now 12, the most in play: on the quays, aboard and in the water). The old pallet count is kept as `potting.palletPots` 5 for the old way. Ordering a pot switches potting on in the world.
  - **`cargoOrder`** (ref: the port; args [0 crates, 1 crane lifts, 2 pots]; value: how many, 0 a full load; targetId: the boat lying there): made by the host, as every cargo intent. **`cargoOrderReturn`** sends back what was ordered at that port and still waits on its quay (not project goods, salvage or the trawl's fish).
  - **A full load** is what the boat lying there takes: her payload, her slots (a slot-limited boat) and room on her open deck, as a dry run of quick loading (the same `deckSpot`, oldest first), counting what's already waiting for her. Each new item is made, packed with the rest, and taken back if it won't go. Goods come as the port's own products; after `terminal.fillMisses` (8) that won't fit, plain crates top her up, so the screen's count and the load agree. One order makes at most `terminal.maxOrder` (24), also the most crates waiting on one quay.
  - Crane lifts: at a harbour with a cargo quay, on its edge as before; a full load wants a deck crane aboard.
  - With a cargo contract running, crates (and crane lifts) ordered anywhere are bound for its port.
  - Crate and pot makers split out per port (`makeCargoAt`, `makeCraneCargoAt`); the old stocking uses them, unchanged.
  - Quick loading now takes the oldest first by number (cargo-9 before cargo-10: `byNumber`), so goods ordered later go on last and the dry run packs as the loading does.
- **The screen** (`ui/cargoTerminal.ts`): a post at the near end of each harbour's goods row (`terminalSpot`: `terminal.beforeRow` 1.7 m before its first place, facing the water; a step further along or at the row's far end if that isn't dry ground or is within `clearOfLamp` 1.6 m of a quay lamp post), a housing and a lit **CARGO** sign.
  - Within `terminal.range` 14 m its screen (1.25 m wide) lights up, worked like the boatyard's board: the harbour; the boat lying there (yours if she's there) with her payload free and slots (or "no slot limit"); for Crates, Crane lifts and Lobster pots her room for more, **Order 1** and **Full load** (or why not: she's full, no crane aboard, no cargo quay here, all pots out); what's waiting on the quay and **Send back**.
  - One menu and one post for every harbour, moved to the nearest within `drawRange` 120 m: three draw calls near a harbour, none elsewhere. What it shows is worked out every `refreshS` 0.4 s, not each frame (her room is a dry run of loading).
  - In the career and on every Voyage map.
- **Texts:** the tutorial's cargo step sends you to the screen; the menu's Load and Load pots say to order at the screen when nothing waits; the Potting setting's notice.
- **Tests:**
  - tests/cargoOrder.test.ts (8): the quays start empty; every harbour's screen on dry ground in its goods area; one at a time, with or without a boat; a full load that all goes aboard; pots up to their limit; crane lifts only at a cargo quay; send back; a contract's port.
  - tests/cargo, cargoHands, duties, potting and quickJobs test carrying, lashing, potting and hauling with the ports stocked (`onDemand` off for those files), as before.
- **Checked headless:** at Calder Haven (the starter gillnetter: room for 15 crates; a full load of 13 and two pots on the quay; room 0 after) and on Oban (the pilot boat), the screen read and in the clear of the lamp posts.
- **Not checked:** on the Quest (reading it, pointing at it), and a crew-mate ordering in multiplayer.
- **Shared changes:** `src/core/world.ts` (no stocking at the start with goods on order).

### The planning chart: zoom and pan your own view, anywhere, Voyage and career (28 Oct 2026)

Owner: "I really like the voyage planning map, but it doesn't spawn in on all harbor sites. And I would kind of like to have it on the boat as well ... plan a route where they've got control over the map so they can zoom in and out". Then, of the ideas (a chart board you carry, the boat's chart table, a reliable quay table): "go ahead with step 1, own view each, career too".
- **Found** (why the quay table doesn't show everywhere):
  - it only stands at the map's start harbour or where the host last used Go;
  - it needs a level patch 2.4 × 1.6 m clear of buildings within 80 m of the berth, else there's no table, and at the start harbour then no Shipyard sign or boats board either (they're set up with it; not fixed yet: step 2);
  - Voyage only.
- **The planning chart** (`voyage/planChart.ts`):
  - **Each player's own view** (`ChartView`): zoomed about a point so what's under it stays put, panned by dragging, kept on the map (from `chart.minSpan` 300 m across out to the whole map); nothing about it is sent.
  - **Drawn with the chartplotter's own land**, moved out into `nav/landLayer.ts` (the plotter draws as before), so the coast is sharp at any zoom. Redrawn until every square of coast in view is outlined, since the outlines are built a few a frame.
  - **On it:** harbours and names (named from `chart.portNamesSpan` 20 km across), place names by rank as on the plotter, wrecks and marks, every crew's boat (yours yellow), the route as on the table, a scale bar and north.
  - **A press with a tool** sends the same `plan` intent as the quay's table (`toolIntent`), so the plan stays the host's and everyone's.
- **Desktop** (`ui/planChartPanel.ts`): full screen, on **M** (the debug time keys move from N / M to F6 / F7) or the Voyage tab's new **Open the chart**.
  - Wheel zoom about the pointer (`chart.wheelStep` 1.2 a notch); drag to pan (a move under `chart.dragPx` 5 px is a click); click to place.
  - The tools and buttons along the top; the next point along the foot.
  - Every game key but M is the chart's while it's open (`CHART_PANEL_CODES`), so you don't walk off; the mouse is freed. Redrawn only when something on it changes.
- **VR** (`player/chartBoard.ts`): **Open the chart** puts a board 0.6 m wide in your left hand (`chart.board`), turned to face you.
  - Your right hand's pointer works it: trigger press and release places a point or presses a key along its foot; trigger held and dragged pans; the thumbstick zooms about the pointer (`chart.stickZoomPerS` 3).
  - Its left hand, and the right while pointing at it, are its (busy).
  - One mesh, one 1024 × 768 canvas, redrawn at most every 0.08 s and only when something on it changes; only while it's out.
- **Career too:** the Voyage tab's Voyage plan row (the next point, Open the chart) is in both modes. The career's plan is saved in the browser under its own key (`swvr.career.plan`; a Voyage map's as before). The chartplotters already steered for the plan in the career.
- **Tests:**
  - tests/planChart.test.ts: zoom about a point keeps it under the pointer; the pan; kept on the map; a press makes the table's intents; planning in the career.
  - The menu test's host gains `openPlanChart`.
- **Checked headless:**
  - the desktop chart in the career and on Oban: opened with M, three points placed by clicking, zoomed with the wheel, panned, W blocked while open, M closing it;
  - the VR board with fake hands: two waypoints and a stop placed with the trigger and the STOP key, the stick zoom (6 km across to 2 km), a drag that panned without placing a point.
- **Not checked:** on the Quest (its frame rate with the board out, how it feels in the hand), and two players planning together at once.
- **Shared changes:** `src/core/keybindings.ts` (M is the planning chart; the debug time of day keys move from N / M to F6 / F7).

### The foiling ferry's retractable foils at her helm: FOIL · HULL · SHALLOW (28 Oct 2026)

Owner: "and they are retractable" (her foils: 2.7 m draught down at rest, 1.2 m foiling, 1.0 m retracted in shallow mode). The hull chat built the retracting (on next, e5d329a): `controls.foilMode` 2 SHALLOW, `foils.mode` 0..2, `foil.deploy` (1 down .. 0 up) and `foil.draught` (m).
- **The switch is three-way** (`control.toggle`, `positions: 3`):
  - forward FOIL, middle HULL (foils down), aft SHALLOW (foils up);
  - engraved FOIL·HULL·SHALLOW;
  - it **sweeps** (new `Toggle` option `sweep`, the module's `sweep: true`): each press moves the bat one step along its travel and turns back at the ends, FOIL → HULL → SHALLOW → HULL → FOIL. A plain three-way toggle cycles 0 → 1 → 2 → 0, which here would have gone from FOIL straight to SHALLOW in flight.
- **The FOILS screen:**
  - new phases RAISING FOILS, FOILS UP, LOWERING FOILS; LANDING in SHALLOW too, since she comes down off her foils before they fold;
  - FOIL, HULL or SHALLOW at the top;
  - her draught now (amber deeper than `CONFIG.foilHelm.deepDraughtM` 1.5 m);
  - the side view drawn to her real draught, so the foils come up under her.
- **The hydraulics** (`audio/hydraulicsAudio.ts`, a new `foils` voice, a quieter, higher pump than the crane's): heard while the foils are travelling (`foil.deploy` changing).
- **Her flaps in two rows** on the screen, FWD and AFT, each port then starboard (`foilRows`, from her own foils' layout, VesselDef.foils). Her new arrangement has four panels (the forward foil's two halves, a T-foil under each hull aft); the screen had labelled three. The side view tilts each foil by its row's mean flap.
- **The RIDE knob's** side marks pulled in off its plate's edges.
- **Tests:** tests/foilHelm.test.ts:
  - the switch is three-way and sweeps;
  - the switch reaches SHALLOW through the bus;
  - the screen's new phases;
  - the sweep's order, FOIL, HULL, SHALLOW, HULL, FOIL.
- **Checked headless:** the switch and knob close up; the screen in four states (flying, landing in HULL, raising, up); in the game, the real switch pressed twice at rest (FOIL, HULL, SHALLOW): the foils came up over about 20 s, her draught 2.7 to 1.0 m, the screen reading RAISING FOILS then FOILS UP; one press back to HULL lowered them (LOWERING FOILS, then ON HER HULLS, 2.7 m).
- **Not checked:** VR, and the hydraulics by ear.
- **Shared changes:** `src/modules/toggle/index.ts` (the `sweep` option); `src/shipyard/parts/recipe.ts` (her switch three-way).

### The foiling ferry's helm: FOIL / HULL, the ride height knob, the FOILS screen, her sound and feel (28 Oct 2026)

Owner: "Do 1, 3 and 4, three ride heights; hull chat does physics", then "build the foiling controls and display and noises". The hull chat put the physics side on next (foilMode, foilRide, bus keys `foils.mode` and `foils.ride`, her flight in `VesselState.foil`); the Shipyard made her a one-off (3badedb).
- **Her switch panel:** a FOILS group (blue) with:
  - the **FOIL** toggle (`control.toggle` on `foils.mode`): up FOIL, down HULL;
  - the **RIDE** knob, a new three-position rotary selector (`controls/Selector3.ts`, module `control.selector3`, `modules/selector3`) on `foils.ride`: LO, N and HI round it, a press steps it on, its pointer showing where it is.

  A toggle's three-way setting was looked at first: its middle is "off", so normal ride height would have shown tilted.
- **The FOILS screen** (`controls/instruments.ts` `foil`; a FOILS page on a touchscreen; with any instruments, old school too):
  - what she's doing (`foilPhase`: FLYING once her hulls are `flyingClear` 0.85 out of the water in FOIL, TAKING OFF, LANDING in HULL, ON HER HULLS under `landedClear` 0.35);
  - her speed and power, FOIL or HULL, the ride setting lit;
  - how far the flight computer has her;
  - a side view of her over the mean sea at her keels' height, her foils under her, each tilted by its flap (drawn three times larger, to see it);
  - each flap's angle, red past `flapWarnDeg` 8°.

  All from her state, so a crew-mate's screen shows the same.
- **Sound** (`audio/foilAudio.ts`, `CONFIG.foilHelm.wash`, `hiss`): as her hulls come clear the water's rush along them falls to `wash.floor` 12 % of its level. The struts and foils hiss instead: band-passed noise at 2.6 kHz, as speed squared, with a faint singing tone that climbs with her speed. Rendered offline at 25 kn: the hull's water 0.030 rms on her hulls; flying, 0.005 of it left and 0.011 of hiss: about 8 dB quieter overall, and thinner.
- **Feel** (`FoilFeel`, `CONFIG.foilHelm.liftOff`): a light buzz through both controllers as her hulls lift past 0.6 clear, a firmer thump and a splash as they come back under 0.3. The gap between the two keeps a wave from making it chatter.
- **Tests:** tests/foilHelm.test.ts:
  - her console has the switch, knob and screen, in a FOILS group, with every instrument choice (basic, advanced, touchscreen, old school), and no other boat gets them;
  - the switch and knob work her through the bus;
  - the screen's phases;
  - the sound's levels;
  - lift-off and touchdown felt once each, no chatter.

  Shipyard tests all pass.
- **Checked headless:** her dash with the FOILS screen; the switches close up; the screen painted in four states (on her hulls, taking off, flying, landing in HULL); flying her in the game (full ahead: lifting off at about 16 kn, flying at 18, settling at 26 to 27 kn on 100 to 135 kW, her keels about 0.6 m clear, the screen reading FLYING); the real knob pressed to HIGH, and she rose about 0.12 m; the real switch to HULL at 25 kn, and the flight computer let go and she settled onto her hulls over about 4 s, the screen reading LANDING then ON HER HULLS.
- **Passed on to the hull chat** (owner, mid-change, foils and physics being its area): her real foil specs (draught 1.2 m foiling, 2.7 m with the wings down at rest, 1.0 m retracted in shallow mode; "she will operate better in higher sea states") and her actual foil arrangement (from the owner's picture: two slim struts with small T-foils at one end, a pi frame with one wide foil spanning between the hulls, winglets at its tips, at the other). Proposed for the helm: FOIL / HULL / SHALLOW on the one switch (a three-way toggle: forward FOIL, middle HULL, aft SHALLOW).
- **Not checked:** VR, and the sound by ear.
- **Shared changes:**
  - `src/shipyard/parts/recipe.ts` (the Shipyard's): her switch, knob and screen; the FOILS panel group; the screen in her dash row and touch pages; kept with the basic controls.
  - `src/modules/selector3/` (new) and `src/boats/library.ts` (registering it).
  - `src/audio/waterAudio.ts` (`wet`: how much of her hull makes the water's sound).

### The foiling electric ferry's helm: decided, waiting on the physics and the Shipyard (28 Oct 2026)

Not built yet. The hull modifications chat put her hydrofoils and flight computer on next (842d0d8) and handed her helm to this chat. Owner: "Do 1, 3 and 4, three ride heights; hull chat does physics."
- **This chat will build:**
  - a FOIL / HULL switch;
  - a three-way ride height knob (low, normal, high; no trim control);
  - a flight display (flying or not, ride height, flap angles, power);
  - the sound and feel of lifting clear (the hull noise stopping).
- **The hull chat does the physics side:** reading the switch and ride height from her state (proposed `controls.foilMode`, `controls.foilRide`, bus keys `foils.mode`, `foils.ride`, ride depths in CONFIG.foils), bringing her down gently on HULL, and a small `foil` summary in her state for the display and sound, so crew in multiplayer see it too (the `foilTelemetry` global is the host's only).
- **Waiting on:** that physics, and the Shipyard chat making her a one-off you can sail.
- **Shared changes:** none.

### The engine rooms' textures: another pass to make them pop (28 Oct 2026)

Owner (passed on by the hull modifications chat, then confirmed here: "Go ahead with textures"): "Do another pass on the engine room textures to make it 'pop'."
- **Found** (headless screenshots, the tug's room from six places): nearly every surface was one flat colour under an even light (a bright fill, 1.25 and 0.3, lamps 2.2 over 7 m, no shine). Only the floor wore a texture, so the walls, deckhead, duct and engines read like card.
- **New pixel paint tiles** (`render/pixelPaint.ts`, sizes in `CONFIG.pixelPaint.tileMetres`):
  - `machinery` 1.6 m: painted cast or fabricated metal, a fine speckle, oil stains and runs, chips to bright metal.
  - `lagging` 0.8 m: quilted exhaust cloth in 20 cm puffed pillows with stitch lines.
  - `galv` 2.4 m: galvanised ductwork, a seam every 1.2 m. A spangle was tried first; close overhead it read as blocks. A pressed cross-break was tried next; on a duct this shallow only fragments showed.
  - `perforated` 1.2 m: the deckhead's insulation cladding, 60 cm panels with a grid of holes.
- **Where they go:**
  - Every room's shell (`app/engineRoom/view.ts`): the sides and bulkheads wear the existing `steel` tile (plates and weld seams), the deckhead `perforated`, and a plain room's floor `chequer`.
  - In the tug's room, each kind of surface wears its tile by its colour (`tug/kit.ts` `PAINT_BY_COLOUR`): the engines (blocks, heads and rocker covers), the generator sets, air bottles, compressor, starter boxes, stands, fans, bases and drip trays get `machinery`; the lagging gets `lagging`; the day tanks and thruster room door get `steel`; the duct gets `galv`.
  - Pipes, rails, valves and signs stay plain colours and shine.
- **Shading** (`app/engineRoom/look.ts`, `CONFIG.engineRoom.look`):
  - A satin sheen: Phong in place of Lambert, `sheen.specular` 0.3 and `shininess` 30.
  - Dirt baked into the vertex colours by height (`grime`): 38 % darker at the floor plates, clean from 1.4 m up, and 18 % darker in the last 0.5 m under the deckhead. The floor plates' own faces are left alone.
  - The tug's lights (`lights`): a dimmer fill (`hemi` 0.7, `ambient` 0.12) and brighter lamps (`lamp` 4, `lampRange` 9 m, `lampDecay` 1.4), so there are pools of light and shade, and the sheen shows.
  - Its light fittings' diffusers glow (drawn unlit, `lampGlow`), going dark at dead ship.
- **Cost:** one more draw call below (the diffusers); no new shapes. Phong's shine costs a little more per pixel than Lambert, with the same three lamps.
- **Tests:** tests/pixelPaint.test.ts covers the new tiles (each averages mid-grey, and is the same every time); the full suite passes. **Checked headless:** the tug's room from six places, before and after (aft and forward along the aisle, beside an engine, the switchboard, the control room console, the day tanks, a generator); at dead ship; and the trawler's plain room. **Not checked:** VR, and the Quest's frame rate with Phong. Worth a look: if it drops, `roomMaterial` can go back to Lambert (the tiles, dirt and lights stay).
- **Shared changes:** none (`render/` and `config.ts` are this area's).

### The harbour tug's prop wash follows her drives (27 Oct 2026)

Owner: "The prop wash effects do not respect the direction of the kort nozzels."
- **Found:** the wake (`vessel/view/wakeTrail.ts`) had one ribbon of foam, laid at the transom and always carried straight aft by her mean thrust: right for a propeller on a shaft, wrong for the tug's azimuth drives, whose nozzles throw their jets any way round.
- **Now:** each azimuth drive lays its own ribbon of wash in the same mesh (no extra draw call), from its propeller (ahead of its leg along its push), carried the opposite way to its push at its own thrust (momentum theory as before, its speed of advance the water along its push). Drives turned athwartships throw the wash out to the side; turned astern, it runs forward under her and out past the bow; one each way, two ribbons. Her transom's ribbon keeps the Kelvin arms only. Each drive's share of her thrust (the state keeps the mean of the two): its revs squared, in gear. New: `CONFIG.effects.wake.drivePoints` (64 points per drive) and `driveHalfWidth` (0.55 x the propeller's diameter either side of the jet's axis at the nozzle).
- **Tests:** the full suite (no new test: drawing only). **Checked headless** with the tug in open water: drives athwartships (port drive pushing to starboard, starboard to port: a ribbon out either side of her stern), both astern, and split (45° and −135°: one ribbon each way, curling as she turns): screenshots from overhead and the quarter. Two drives laying a point in the same frame each keep their own GPU upload (the first went missing at first). **Not checked:** VR; the Quest's frame rate (a few hundred more vertices in the one wake mesh).
- **Shared changes:** `src/modular/module.ts` (the diesel's gear facts: `azimuth` now says where the legs stand, `{ legZ, propY }`, instead of `true`; every reader only asks whether it's there) and `src/modules/dieselInboard/index.ts` (fills it in), `src/vessel/view/wakeTrail.ts` and `vesselEffects.ts` (the wash per drive).

### Quick start works on the tug whatever she was left like; her batteries charge from the generator (27 Oct 2026)

Owner: "Quick start wasn't working in the tug I had in my favourites."
- **Found** (reproduced in the career with the tug): Quick start silently did nothing (a) with a lever left at some power (the small boats' neutral-safety rule: the tug's lever power counts as in gear), and (b) with her batteries flat (dead ship leaves the 24 V master on with nothing charging, so a tug left a while drains).
- **Fixed** (`plant/plant.ts` `plantReady`, `stepPlant`; `CONFIG.plant.chargeSocPerS` 0.006, `jumpStartSoc` 0.3): on the tug, Quick start brings both levers to idle first (she starts in neutral), and gives flat batteries enough to start on (a jump start); and her switchboard's battery chargers fill the 24 V batteries while the generator is on line (flat to full in about 3 minutes), as on a real tug.
- **Tests:** tests/plant.test.ts (Quick start with the levers at 0.4 and the batteries flat: both engines running, the levers at idle, the batteries charging). **Checked headless** in the career with the tug: fresh, levers left forward, flat batteries: each time she starts.
- **Shared changes:** none.

### The harbour tug's V16s: a big rumbling voice, and loud in her engine room (27 Oct 2026)

Owner: "we'll come back to engine sounds, because we need a big rumbling noise for these big diesels"; "Move onto sounds".
- **A V16 voice** (`CONFIG.engineVoices.v16`; the tug's engine in the Shipyard's catalogue now takes it, it had the landing craft's small V8's): 16 cylinders four-stroke, 80 firings a second at her 600 rpm idle, 213 at 1600 rated; long pulses (big cylinders) so the beats run into a roar; the banks firing in turn with the starboard bank's pulses weaker, so half the firing rate (40 Hz at idle, 107 flat out) growls under the beat; a big, low exhaust (resonances at 62 and 96 Hz), the top rolled off more than the other voices; a low turbo whine rising with boost; a little valve-gear and injector clatter (300 to 1100 Hz).
- **In her engine room** (`CONFIG.engineRoom.sound`: `level` 1.2, `mech` 5, `compress` −22 dB at 8 : 1; `EngineSound.set`'s `room`, App): louder than on deck, the clatter five times up, no wet-exhaust muffling, through a compressor that's open (0 dB) everywhere else, so two engines flat out are loud and dense without clipping.
- **Rendered offline** (headless Chromium, the game's own engine sound, both engines as the game plays a twin, 3 m off, idle then opened up to full): flat out, 54 % of the V16's sound is under 150 Hz on deck (37 % at first try; the old V8 voice at her revs 93 %, but a small engine's thin beat), idle 97 %; peaks 0.70 on deck, 1.09 in the engine room before the game's volume (0.72 after it: no clipping). The clips were sent to the owner to judge by ear.
- **Not checked:** by ear (no speakers here); in VR.
- **Shared changes:** `src/shipyard/parts/catalog.ts` (the tug's engine's voice, one word: the Shipyard chat's file, for the owner's ask) and `tests/shipyard/tugVoice.test.ts` (its list of the engines' voices: the harbour tug's now `v16`); `src/audio/engineAudio.ts` (the engine room's `room`, clatter level and compressor; other boats unchanged: the compressor is open and `room` 0 for them).

### The tug's engine room labelled; no flicker; the gauge board clear (27 Oct 2026)

Owner: "many of the things are not labeled, so you don't know what's the oil pump, you don't know what all the switches in the electrical bus board do. There's also some Z fighting in the engine control room and some gauges hidden behind the wall with the pipes on it ... label everything."
- **Name plates** (`tug/labels.ts`, placed by `TugRoom.plates`; one canvas, one more draw call): engraved-style white plates, a name and what it is or does, on: the fuel day tanks (which engine) and their outlet valves; the starting air bottle and its main air valve; the air compressor; the sea water strainers and sea suction valves (which engine); generator 1 (in use) and 2 (standby), generator 1's fuel valve and START / STOP; under each engine stand's switches, "PRE-LUBE PUMP · START · STOP" with "lube oil pump: run until 1 bar, then START"; the bilge and ballast valve chest and the bilge pumps.
- **The main switchboard** (`panels.ts` `MSB_CUBICLES`): each working control now stands in its own cubicle, named on a plate under it: 24 V DC (BATTERY MASTER), GEN 1 (GEN 1 BREAKER), FUEL PUMPS (FUEL SUPPLY PUMP), ENGINE CONTROL (LOCAL · ECR · BRIDGE); GEN 2 (standby), BUS TIE and 400 V DIST are dummies. The controls' hover names say what each does.
- **Z-fighting:** the gauge board, the checklist card, the switchboard's face and the signs on the control room's aft wall sat 1–2 mm off their surfaces; moved clear, and the room's pictures, screens and plates are drawn in front of their surfaces (polygon offset), which holds on the Quest's coarser depth too.
- **The brass gauge board** in the control room was behind the port side's pipe runs, which ran through the control room: they now end at its aft wall.
- **Checked headless:** each group close up, lit (the switchboard, an engine's stand, the tanks and air bottle, the strainers, the generator, the gauge board now clear). **Not checked:** VR (legibility in the headset; the flicker on the Quest).
- **Shared changes:** none.

### Engine rooms: the next step glows; solid walls in VR; crew-mates seen below (27 Oct 2026)

Owner: "highlight the next thing that needs to be touched ... Don't make it too easy, but if it was somehow glowing"; "it's still possible to slide through the walls of the engine room"; "in multiplayer ... I could see one of the players, but that player couldn't see me. And then when I ... came back, it was the other way around."
- **The cue** (`plant/plant.ts` `nextControls`, `tug/room.ts`, `Control.cue`; `CONFIG.plant.cue` `on`, `level` 0.55, `periodS` 2.2): the next step's controls still to work glow amber, a slow pulse, and stop once worked. Nothing glows while she waits (the generator running up, the oil pressure building) or once she's handed over. Only the controls themselves: you still find them.
- **Solid walls in VR** (`App`, `engineRoom/walk.ts`): aboard, VR movement goes through walls by design (the wheelhouse), fenced only at her edge; below, it now collides with the room's sides, the control room's walls and the machinery as the desktop does, and doesn't lift you off the floor. A head leaned through a side, a bulkhead or the deckhead (room-scale) fades the view, as the engines did.
- **Crew-mates below** (`engineRoom/index.ts` `hideOutside`): going below hides everything outside the room, again each frame, but it never showed anything again: a crew-mate still on deck when you went down stayed hidden when they came down after you (so whoever went first couldn't see the second). What's to be kept is now shown again.
- **Tests:** tests/plant.test.ts (the cued controls at each step, none while waiting or once handed over).
- **Checked headless:** a crew-mate (a second player put in the world) on deck, then below by you: hidden, then shown, then hidden again when back up; the cue on the battery master, then the generator's fuel valve glowing amber in the dark room. **Not checked:** VR (the walls, the cue's look in the headset), real multiplayer with two headsets.
- **Shared changes:** `src/controls/Control.ts` (`cue`).

### Engine rooms: the ladder is the only way out (27 Oct 2026)

Owner: "if you jump, you actually jump out of the engine room back to the ship ... The only way in and out should be the ladder."
- Below, the jump (Space, VR's A) and board / go ashore (B, the left stick's click) do nothing but say "In the engine room: climb up at the ladder" (`App.updateBody`, `App.toggleBoard`). A jump took you into the air off her deck, which the engine room took as having left.
- **Checked headless:** below, Space and B: still below, aboard, on the floor plates; on deck, Space jumps as before. **Not checked:** VR (its A button).
- **Shared changes:** none.

### The harbour tug's start-up, part 2: the START-UP page, the checklist card, the machinery's sounds (27 Oct 2026)

Owner: "go to the next stage in the engine startup" (part 2 of the agreed plan).
- **The START-UP page** (`app/engineRoom/tug/panels.ts` `startupPage`; the steps from `plant/plant.ts` `startupSteps`): the control room's middle screen shows her nine steps until she's handed to the bridge (then POWER & TANKS again). Each step is ticked from her state as it is; the next is marked and blinks, with where to go or how it stands (the generator's run-up seconds, the oil pressure, the air's bar).
- **The checklist card** (`FIXED.card`, the fixed canvas now 1024 × 1536): a laminated card, about A3, on the control room's inboard wall beside its door, facing the aisle: the nine steps, where each control is, and what to wait for.
- **The machinery's sounds** (`audio/plantAudio.ts`, the engine bus; synthesised, no files):
  - the generator: a small diesel's firing note and clatter, rising in pitch and level as it runs up;
  - the supply fans' roar on a live switchboard;
  - the compressor's chug, easing as the bottles fill;
  - a blast of starting air at each main engine's start.

  Full volume below; on her deck a quarter, muffled through the hull (`App.plantSound`).
- **Fixed:** below, "Press F to take the helm" showed (the helm is right overhead, and the distance check is level only); F no longer takes the helm from the engine room.
- **Tests:** tests/plant.test.ts (the steps tick off from dead ship to the bridge; the generator's run-up shown).
- **Checked headless:** the page part-way through a start (steps 1–4 ticked, step 5 marked, with its place); the card on the wall from the aisle; the sounds following her state (silent dead; the generator quiet and low running up, at 50 Hz on line; the fans and compressor on; a quarter on deck), with no errors. Not heard (no speakers here).
- **Not checked:** VR, and the sounds' balance with her main engines by ear.
- **Shared changes:** none.

### The tug's levers in VR: the hand twists, the stick sets the power; a click synchronises the throttles (27 Oct 2026)

Owner: "the throttles are on the stick, which is right, but I don't want the twist to be on the sticks. I want the twist to be with hand controllers"; "I need a button which synchronizes the throttles ... the throttles are at the same power. Maybe ... a click in, so you can do it while you're on the hand controllers."
- **Twist by hand, power by stick** (`modules/azimuthLevers/lever.ts`, `CONFIG.modules.azimuth.lever.vrTwist` 'hand'; 'stick' brings back the stick's sideways twist): holding a lever, turn your wrist and it turns (`twistGain` 1.5 degrees a degree, from the grab; the notches as ever); the thumbstick forward and back sets its power; the stick's sideways and pushing the hand do nothing. `handMoves` stays off.
- **Synchronised throttles:** the thumbstick clicked in while a hand holds a lever (`Control.stickClick`, `HandFrame.stickPressed`) sends `aziSync` (1 or 2: on, at the port or starboard lever's power; 0: split). On, the host sets both throttles to that lever's power, and from then on a `throttle.demand` or `throttle.demand2` sets both (`vessel/vesselControl.ts`, `VesselControls.aziSync`, holds respected). A held lever whose stick is still follows the other's power. A buzz and a notice ("Throttles synchronised"); the desktop dials say SYNC.
- **That click is the lever's** while the hand holds it: the left stick's click doesn't board / go ashore, the right's doesn't work the laser.
- The driving guide poster and the README say the new way.
- **Tests:** tests/azimuth.test.ts (the modular-builder chat's thumbstick-only test rewritten for the new split: the hand twists, the stick's sideways doesn't, its forward gives power, the hand turning back follows; the click sends the sync); tests/plant.test.ts (synchronised: both to the clicked lever's power, either sets both, split again).
- **Not checked:** VR (the twist's feel, the click). No visible change on the desktop beyond the dials' SYNC.
- **Shared changes:**
  - `src/modules/azimuthLevers/lever.ts` (`vrTwist`, `stickClick`, a held lever following the power), `src/modules/azimuthLevers/index.ts`, `src/config/modules.ts` (`vrTwist`), `src/modules/poster/azimuthGuide.ts` (one line): the modular builder chat's files, for the owner's ask;
  - `src/vessel/vesselState.ts` (`aziSync`), `src/vessel/vesselControl.ts` (the `aziSync` intent; synchronised throttles).

### Driving the harbour tug from the keyboard and a game controller (27 Oct 2026)

The owner: "I want my non-VR friends to be able to drive this tug"; built from the modular-builder chat's handover (below), with the owner's decisions. Only at the helm of a boat with azimuth drives (`gearOf(v, 'diesel')?.azimuth`), on the desktop (F by her wheel, or a controller's A); every other boat's helm is as it was.
- **Keys** (`player/aziHelm.ts`, `App.driveAzimuth`): W / S / A / D the port drive (power, twist), the arrow keys the starboard one, at the levers' own rates (`KEY_TURN` 90°/s, `KEY_LEAN` 0.5 a second, now exported from `modules/azimuthLevers/lever.ts`) and with their notches (`snapTo`: the turn clicks at ahead, abeam and astern and on through). Power stops at idle; astern is twisting round. X both to idle; T TRANSIT on / off. In TRANSIT, A / D (← →) steer the wheel and W / S (↑ ↓) set both throttles, as on any boat. Sent as the levers' own intents (`azimuth.demand`, `throttle.demand` and their `2`s, `azimuth.transit`, `helm.demand`), so a VR crew-mate sees the levers move, and the engine room's handover (`plant.bridge`) still governs them.
- **Looking:** Q over the port shoulder, E over the starboard one, Q + E or Tab aft, held (`CONFIG.aziHelm.glanceDeg` 115°, easing over `glanceTau` 0.12 s; `DesktopController.glance`, on top of the mouse look). At her helm the keyboard claims W A S D, the arrows, X, T, Q, E and Tab (`AZI_HELM_CODES`): their usual jobs wait (Q cargo, E engine, T sea trials), and Tab doesn't move the page's focus.
- **Controller:** point and push (`pointAndPush`): each stick's direction is its drive's (up ahead, right to starboard, back astern; notched), how far its power; let go, idle, still pointing there. Hold LB: the right stick looks round instead (the starboard drive holds); a tap of LB looks ahead. RB TRANSIT (then the left stick steers, the right stick's up sets both throttles); B both to idle. The orbit and flyby views swing on LB + the right stick.
- **On-screen dials** (`ui/aziDials.ts`, `CONFIG.aziHelm.dialPx` 150): bottom left the port drive, bottom right the starboard: the ENGINE screen's dial (`controls/instruments.ts` `azimuthDial`, now exported), the arrow where the drive pushes, the ring where its lever asks, and a power bar. Desktop only, at her helm; redrawn only when they change.
- **The helm prompt** says all this, keys or controller.
- **Tests:** tests/aziHelm.test.ts (the keys' rates, idle floor, notches and on through; point and push; the glance; the claimed keys).
- **Checked headless** (desktop, Oban, the tug readied by Quick start), with real key presses:
  - F took her helm and the prompt changed;
  - W raised the port drive's power and D twisted it, clicking into 3 o'clock; ↑ raised the starboard drive's power and ← turned it to port; the drives followed;
  - Q and Tab turned the view (115°, aft), and it came back;
  - T switched TRANSIT on and off; E no longer stopped her engine;
  - the dials showed both drives, and went away when she was left.

  The headless browser runs her deck at under a frame a second, so key holds were long.
- **Not checked:** a real game controller (none here; its sums are tested), and in a friend's hands.
- **Shared changes:** `src/modules/azimuthLevers/lever.ts` exports `KEY_TURN` and `KEY_LEAN` (no other change).

### The harbour tug's start-up from dead ship, part 1 (27 Oct 2026)

Owner: "the only thing I want for the engine room is a realistic startup procedure. So it's go downstairs, turn the fuel and whatever is appropriate for the generator, get power on"; the plan agreed, "go ahead with part 1".

- **The procedure** (`src/plant/plant.ts`, its state `VesselState.plant`, plain JSON stepped by the host after her machinery each tick; `CONFIG.plant`). She comes from port **dead ship**:
  1. 24 V: the battery master (`electrics.master`), now also on the control room's switchboard;
  2. the generator: its fuel valve, START on its control box; it runs up in `genRunUpS` 8 s;
  3. power on: the generator breaker on the main switchboard (refused while it's stopped or running up; it trips if the generator stops). The room's lights come up from the emergency lights' glow;
  4. fuel: each engine's day tank valve, and the fuel supply pump on the switchboard;
  5. sea water: each engine's sea suction valve, at the strainers;
  6. pre-lube: each engine's pre-lube pump, until its oil is at `lubeStartBar` 1 bar (`prelubeBar` 1.5 in `prelubeS` 15 s; falling `lubeDecayBarS` 0.05 a second with the pump off; `lubeRunBar` 4.2 running);
  7. starting air: the compressor (`airFillBarS` 0.75 bar a second to `airMaxBar` 30) and the main air valve; each start takes `startAirBar` 4 and needs `airStartMinBar` 12;
  8. START at each engine's own control stand (or from the bridge once handed over);
  9. the engine control switch (LOCAL / CONTROL ROOM / BRIDGE) to BRIDGE: only then do the bridge's levers and STARTs work her.
- **Missed steps say so, as her alarms would:** START with no 24 V, oil pressure, fuel, fuel pressure, air valve or air is blocked, with the reason (`plant.note`, said to whoever's aboard: `App.plantNotes`). Running, a day tank valve shut stops that engine after `starveS` 6 s; a sea suction shut is the cooling fault the boats already have (she heats up and alarms); the generator's fuel shut stops it, and its breaker trips: blackout. The bridge's START before the handover says "Engines not ready: the engine room has control".
- **The controls** (`app/engineRoom/tug/controls.ts`): 18 ordinary controls through intents `er.<what>` (multiplayer works as for any control):
  - a new handwheel `Valve` (a press opens or shuts it; its wheel turns and its spindle rises when open), toggles, buttons and the battery master;
  - on the switchboard, the generator, the day tanks, the air bottles and compressor, the strainers, and each engine's **local control stand**: new, a pedestal in the aisle beside each engine with its panel at eye height (the panel on the engine's side was hidden behind its lagging);
  - built with the room, registered with the interaction system then (`BelowContext.addControls`), working only while you're below.
- **Quick start** (Menu > Tests, and the Shipyard's sea trial) readies it all and hands her to the bridge (`plantReady`), so nothing that starts her the quick way changes. A tug already running when her plant is first made (a game carried on) starts ready, her pre-lube pumps on.
- **The screens' alarm list** shows what's still to do: dead ship, breaker open, pumps stopped, valves shut, oil pressure, start air, control not at the bridge.
- **Tests:** tests/plant.test.ts covers:
  - dead ship, with the bridge's START dead;
  - the whole procedure to the bridge, her levers then working her;
  - each missed step blocking her start, with its reason;
  - fuel, sea water and the generator's fuel shut while she runs;
  - Quick start.

  tests/azimuth.test.ts now readies her engine room first.
- **Checked headless:**
  - the whole procedure through the controls' real press path (the interaction system's, routed to the host), from dead ship to both engines running and the control at the bridge;
  - every control seen in place, and the lights going from dead to live;
  - while below: 7–48 draw calls (was 5–10; the controls are small separate meshes) and about 105,000 triangles.
- **Not checked:** VR (reaching the valves and switches, especially the low ones), the Quest's frame rate below with the controls, multiplayer with two below.
- **Shared changes**, all small; other boats unchanged:
  - `src/vessel/vesselState.ts`: `plant`, `PlantState`;
  - `src/vessel/vesselControl.ts`: the `er.` intents, and Quick start readies the plant;
  - `src/core/simulation.ts`: `stepPlant` after her machinery;
  - `src/modular/busKeys.ts`: the `plant.bridge` key;
  - `src/modules/dieselInboard/index.ts`: its `bridge` port. Until she's handed over, the bridge's levers and STARTs don't reach her engines.
  - the golden runs' fixtures (`tests/golden/fixtures/`) and `docs/BUS_KEYS.md` regenerated: they record every bus key, so `plant.bridge` (always on for a boat without an engine room) is new in them; nothing else in them changed.
### (From the modular-builder chat) HANDOVER, built 27 Oct 2026 (see the entry above): driving the harbour tug from the keyboard and a game controller

The owner, 27 Oct 2026: "I want my non-VR friends to be able to drive this tug", reviewed a proposal from the modular-builder chat and chose: arrow keys, power stops at idle, point-and-push sticks, glance keys and LB to look, the on-screen dials, "Handover" (to this chat: it's the helm mode, keys and controller, `src/app/` and `src/player/`). **What to build**, only at the helm of a boat with azimuth drives (`gearOf(v, 'diesel')?.azimuth`); every other boat's helm stays as it is:

- **Keyboard at the helm (F):** the port drive on **W / S** (power up, down) and **A / D** (twist: A turns its push toward port, D toward starboard); the starboard drive on **↑ / ↓** and **← / →** the same way. Power stops at idle; astern is twisting the drive round (never a throttle below zero). **X** both drives to idle; **T** TRANSIT on / off (at this helm only; T is otherwise the sea-trials test key). In TRANSIT, A / D steer the wheel and W / S work both throttles, as on any boat.
- **Looking (keyboard):** right-drag mouse look stays as now. Glance keys, held: **Q** over the port shoulder, **E** over the starboard shoulder, **Q + E or Tab** straight aft; let go and the view swings back forward (smoothly).
- **Game controller at the helm (A):** **point and push**: the left stick is the port drive, the right stick the starboard. The stick's direction is the way that drive pushes (up ahead, right to starboard, back astern: deg = atan2(x, -y), y + down), how far it's pushed past the dead zone its power (0..1). Let go: power to idle, the drive keeps pointing where it was. **Hold LB** and the right stick looks round instead (the starboard drive holds its setting meanwhile); a **tap of LB** (no stick) snaps the view forward. In the orbit / flyby views (Y), LB + right stick swings the camera. **RB** TRANSIT on / off: then the left stick's x steers the wheel and the right stick's y sets both throttles. **B** both to idle. The rest as now (A leave, Y camera view, d-pad anchor / horn / wipers, View talk).
- **On-screen dials** at the desktop helm (not in VR): two small dials in the bottom corners, port left, starboard right, as on the tug's poster: an arrow where its drive really points, a ring where its lever asks, a power bar.

**What the modular side already gives you** (no changes needed there):
- Bus keys (send them as intents, absolute values; the levers in the wheelhouse follow them, so a VR crew-mate sees them move): `azimuth.demand` / `azimuth.demand2` (each lever's direction, deg, 0 ahead, + to starboard, -180..180), `throttle.demand` / `throttle.demand2` (each one's power, 0..1 here), `azimuth.transit` (on / off). Read back: `azimuth.angle` / `azimuth.angle2` (where each drive really points, deg; or `EngineState.azimuth`, rad, port in `engine`, starboard in `engine.stbd`).
- The levers' own rates for keys, to match: 90 deg/s of twist, 0.5 power/s (`src/modules/azimuthLevers/lever.ts` KEY_TURN, KEY_LEAN), and the notches at ahead, abeam and astern: `snapTo(deg, CONFIG.modules.azimuth.lever.snapDeg)` from the same file. The drives follow at `CONFIG.modules.azimuth.slewDegPerS` (12 deg/s).
- The ENGINE screen's dial drawing (`src/controls/instruments.ts` `azimuthDial`) is the look the on-screen dials should copy.

### The tug's levers: the thumbsticks work them, notches at 12, 3, 6 and 9 o'clock (27 Oct 2026)

Owner: grabbed, "the left and right joystick should be controlling the throttles once you've grabbed them. And not sliding you around"; the same holding the wheel; and the azimuth levers should "snap to ... 12 o'clock, 3 o'clock, 6 o'clock, and 9 o'clock to make it a bit easier to find those key positions". (Neither was on any branch: found nowhere in the history, so built here.)

- **A held control's stick doesn't move you.** While a hand holds any control (a lever, the wheel, a joystick, the tiller), its thumbstick neither walks you (left) nor turns you (right): `App.stickFree`, from `InteractionSystem.holding(hand)`.
- **On the tug's azimuth levers, it works the lever** (`Control.stickSteerable` / `stickSteer`, the stick in `HandFrame.stick`): forward and back for more or less power, sideways to twist, at the desktop keys' rates (90°/s, half the power a second). The hand keeps hold: let the stick go and the lever stays where the stick left it, and moving the hand works it on from there. A resting thumb doesn't creep it: `CONFIG.interaction.stickDeadZone` 0.2. Only the levers take the stick for now; the wheel and the other controls just stop it moving you.
- **Notches:** its turn clicks onto ahead, abeam and astern within `CONFIG.modules.azimuth.lever.snapDeg` 8° either side, with a buzz in VR, and turns on through (the lever keeps its own turn under the notch, as its lean under the idle detent).
- **Fixed on the way:** the desktop keys (W) and the stick couldn't take the lever out of idle: each small step fell inside the idle detent and was put back to 0. Its lean now adds up under the detent.
- **Tests:** tests/azimuth.test.ts: the stick working a held lever and the hand holding it after; the interaction system giving a holding hand's stick to it, the dead zone, `holding`; the notches, turning on through them, W from idle.
- **Not checked:** VR on the Quest (the stick and the buzz); not run in the browser (covered by the tests).
- **Shared changes:** `src/modules/azimuthLevers/` (the lever and its options) and `src/config/modules.ts` (`snapDeg`), the modular builder's files: small, for the owner's ask on the tug.

### Engine rooms: the harbour tug's in detail, with an engine control room (27 Oct 2026)

Owner: "make that engine room much more detailed just for the tug ... keep the engine dimensions and the sort of principles of it ... get that triangles and draw calls count back up and use that Quest processing ... some tugboats have an engine control room ... screens, or it could be steampunk."

- **Her room is longer** (a big boat's, `CONFIG.engineRoom.big`: from 24 m, `lengthShare` 0.42 up to `maxLengthM` 10.5): 10.5 × 8.8 m, 2.2 m headroom, 2.9 m forward of her engines for the control room.
- **Her engines in detail** (`src/app/engineRoom/tug/engine.ts`), the same 1850 kW V16s in the same 4.4 × 1.7 × 2.1 m envelope on the same shaft line, in her engines' colour, laid out as a medium-speed V16 generally is (our own arrangement):
  - bedplate on rubber mounts, crankcase doors with their bolts and relief valves;
  - two banks of eight heads with rocker covers, head bolts, injector pipes from the fuel rails, jacket-water branches and the wiring harness;
  - lagged exhaust manifolds to two turbochargers on the free end, with their air filters, and the charge-air cooler;
  - the damper and gear case, engine-driven pumps, the flywheel housing and starters;
  - duplex lube oil and fuel filters, the dipstick, lifting eyes, and a local operating panel with live gauges and an emergency stop.
- **The room** (`tug/layout.ts` where things go, plain numbers, also walked round; `tug/room.ts` the drawing; `tug/kit.ts` shapes):
  - **Control room** forward to port: its window aft onto the port engine; a console with three live screens (the engines and each Z-drive's heading, power and tanks, the alarm list); the main switchboard's cubicles; a chair; a row of brass-rimmed gauges; emergency stops outside.
  - **Forward:** a workbench with a vice and a tool board; two fuel day tanks with sight glasses and quick-closing valves; two starting-air receivers and their compressor.
  - **Each engine's free end:** a red fire pump with its fire main.
  - **Aft:** the shaft lines (couplings, cardan shafts), turning with their engines' revs (shown at a tenth of the speed, so the eye can follow them), under gratings; two generator sets; the thruster room door.
  - **Down the sides:**
    - the bilge and ballast valve chest and pumps, and the sea water strainers;
    - colour-coded pipe runs on brackets;
    - extinguishers, a fire hose reel, oil drums on a spill pallet and a spares rack;
    - sounding pipes, and a caged escape ladder.
  - **Overhead and round the engines:**
    - lagged exhaust uptakes with bellows;
    - lifting rails with chain blocks;
    - cable trays and a ventilation duct;
    - supply fans and CO₂ nozzles;
    - frame knees and light fittings;
    - yellow handrails, with a gap where the ladder comes down;
    - chequer plate underfoot (the game's pixel paint).
- **Panels** (`tug/panels.ts`): two canvases. The live one (screens, gauges, local panels) is redrawn 4 times a second; the fixed one (the switchboard, the tool board, the signs) is drawn once. The alarms come from her state: jacket water and lube oil temperatures, oil level, sea water pump fault, oil pressure with the key on and the engine stopped, low fuel.
- **Cost, measured headless:**
  - below in the tug: 5–10 draw calls and about 105,000 triangles (the merged room, the window's glass, two panel meshes, two shaft lines, three lamps and two room lights);
  - on deck: 127–153 calls and about 330,000 triangles;
  - built in under 0.4 s the first time you go below.
- **Tests:** tests/engineRoom.test.ts covers:
  - her longer room and its control room, gensets, tanks and receivers;
  - a way from the ladder through the aisle and the door into the control room, not through its walls, the switchboard or the gensets;
  - the alarm list.
- **Checked headless:** the aisle, the control room inside and through its window, aft, forward to starboard, the port walkway, with her engines running; no errors.
- **Not checked:** VR, the Quest's frame rate below.
- **Shared changes:** none.

### Engine rooms, milestone 1: going below on the tug and the trawler (27 Oct 2026)

Owner: an engine room as a separate game, for performance; agreed instead (same performance, multiplayer and the simulation kept): in the same page, only the room drawn while you're below; the harbour tug and the stern trawler first. The plan and what's next for the Shipyard and modular builder chats: `docs/ENGINE_ROOM.md`.

- **Where one fits** (`src/app/engineRoom/plan.ts`, `CONFIG.engineRoom`: `minLoaM` 18, `headroomM` 1.95, `deckheadM` 0.25, `minWidthM` 2.2, `walkwayM` 0.7, `minLengthM` 3, `lengthShare` 0.3, `maxLengthM` 8, `endClearShare` 0.12, `liningM` 0.12): from her own hull sections, engine hatch and installed engines (`engines.ts`, from her recipe). The harbour tug (7.5 × 8.8 m, 2.5 m headroom), the stern trawler (6 × 2.9 m) and the dive ship (on the trawler's hull); every other boat as before.
- **Going below** (`index.ts` BelowDecks, `player/gangway.ts`): "Go below" over her open engine hatch (`gangway.hatchRange` 3 m), "Climb up" at the ladder's head (`ladderRange` 2.5 m), by the same pointing as Step aboard. Below, everything outside is hidden (again each frame: some views set their own visibility), and only the room, your rig, the menus, the marks and a crew-mate in the room with you are drawn (`AvatarsView.partsOf`); her walk area is the room's (`walk.ts`: its floor, round the engines). Off her (a teleport, the boat gone), you're out of it without a word.
- **The room** (`view.ts`, its own 4 KB download, fetched the first time): floor plates, lined sides with frames, deck beams and light fittings, a watertight door, her engines as the boat draws them with their shafts, the ladder beside an engine, a live gauge panel per engine (running, rpm, coolant, oil), hemisphere and ambient light. Measured headless, Oban: below 3–4 draw calls and about 2,000 triangles; on deck 127–153 calls and about 330,000.
- **Tests:** tests/engineRoom.test.ts (which hull types have one; standing room inside her plating; her engines in it with a walkway; the ladder beside them; walking round them).
- **Checked in headless Chromium:** the trawler and the tug, "Go below" over the open hatch, the room from inside, the gauges, "Climb up" back on deck beside the hatch, no errors. **Not checked:** in VR, on the Quest, with a crew-mate below.
- **Not yet (milestone 2):** controls in the room (local stops, valves, bilge pump), its sound, a fade, Quest measurements.
- **Shared changes:** none (`docs/ENGINE_ROOM.md` new).

### Fix: a hidden host steps 20 times a second; the tug's gearbox fixed (26 Oct 2026)

Owner: joined a desktop host's game on the Quest, aboard the tug, "the simulation rate ... like 1 frames per second"; and building the tug "takes forever ... trying to work out its gearbox", so she couldn't be saved on the Quest; "it's a fixed gearbox".
- **The hidden host.** One step a second is what the crew get from a host whose tab is in the background (minimised, another tab): since batch 1 it keeps going from a timer, and a background tab's timers run about once a second. Now its steps come from a worker's clock (`net/hiddenClock.worker.ts`), which a background tab doesn't slow: `net.hiddenStepS` 1 → 0.05 (20 a second, the rate snapshots go out), the time since stepped in whole ticks with the rest carried. Checked headless (told it was hidden): 19.7 steps a second from the worker, back to the drawn frames when shown. Not checked with a really hidden tab (headless tabs can't be), nor on the Quest. If the host's tab wasn't hidden, this wasn't the cause: the crew page's own work measured light (each snapshot about 6 ms to read on this computer), so it'd want a look on the Quest.
- **The tug's gearbox:** the Shipyard chat fixed it at the same time (its entry in `docs/progress/shipyard.md`; theirs kept in the merge). Added from here (Shipyard files, logged there): any boat's code is ready to save once her gearbox is matched, the sea trials (27.8 s for the tug on this computer) carrying on behind.
- **Shared changes:** none (the Shipyard's own files, logged there).

### Multiplayer batch 4: playing together in separate boats, and smaller snapshots (26 Oct 2026)

Owner: "go ahead with multiplayer batch 4" (the study's last batch: #3, #7, #15, #27, #25, #33, #31, #35).

- **#3 Smaller snapshots** (`net/worldDelta.ts`, new). Each send says only what changed since the last: a part of the world whole if it changed, and in a set of things (`vessels`, `cargo`, `players`...) only the things that changed, came or went. Worked out once per send and sent as one text to every crew-mate (it was packed again for each). A crew-mate just welcomed gets the whole world once more with the next send. The crew page keeps the pieces as text and parses the world afresh each time, as it always did, so nothing it holds is shared with the next snapshot. **Measured live** (host and crew through the game finder): the whole world 18 KB (Tayvallich), 37 KB (career), 156 KB (Clyde); a send now 2 to 3 KB on each, the Clyde 48 times smaller. **Not measured on a Quest** (the study asked for before and after there): the host's work per send is one pass over the world, about 1 ms on this computer for the Clyde.
- **#15 Each boat her own rescue gear.** A life ring and boat hook per boat (`world.rescue.rings`, `hooks`, by boat; `ringOf`, `hookOf`, `ringIn`, `hookIn`; an old save's one ring and hook become the home boat's). Taking, throwing, hauling and the hook work on the boat the player is aboard; a swimmer takes the ring nearest them. A survivor on a ring climbs aboard that boat (`RescueTarget.ring`, `vessel`), sits in her seats, and is landed from her at a quay; people on a raft come across to whichever rescue boat lies alongside. Every boat's ring and hook are drawn on every page (`otherGear` in App), survivors aboard the boat that took them.
- **#27 Calls follow the players' boats** (`missionBoat`, core/launch.ts): rescue, tow and fire calls come to the players' boat with the most aboard that has the gear for the job (rescue places, a tow point, a fire monitor); the home boat on a tie or with nobody aboard.
- **#7 Voice in either order:** a crew-mate with voice off isn't called; a call with no voice after `voice.answerS` 8 s is dropped and tried again (`retryS` later); the Crew tab says "voice off" by their name.
- **#25** Leaving VR, or the page hidden (a headset taken off), lets go of everything your hands held (`InteractionSystem.releaseAll`).
- **#33** A control someone else holds names them: "Wheel (Bosun has it)" (`HoldRules.holderName`).
- **#31** A crew-mate can't buy yard gear that's fitted aboard (trawl gear, the skiff: it starts everyone again in her): "Ask the skipper".
- **#35** A log barge at the merchant's quay can be sold from any page alongside (the `timberSell` intent, voyage/timber.ts `applyTimberSell`); the host's own sale is still made at once.
- **Shared changes:** `src/core/launch.ts` (`missionBoat`), `src/core/simulation.ts` (the `timberSell` intent). (`src/rescue/`, `src/tow/tow.ts`, `src/fire/fire.ts`, `src/controls/` are the main game's own.)
- **Tests:** tests/worldDelta.test.ts (new: the world rebuilt exactly over 30 steps with crates and parts coming and going; a send under half the world; an unmoved crate not sent); tests/launch.test.ts (calls follow the crew's boat; her own ring thrown, the survivor aboard her and landed from her); tests/metaverse.test.ts (a crew-mate's barge sale); the rescue tests now read the home boat's ring.
- **Checked live:** crewcheck 27 of 27 with the new snapshots; the batch 2 reload checks again (a crew reload, the host launching with crew aboard, the host's reload: all as before); the sizes above. **Not checked:** voice (needs two microphones), the Quest (snapshot cost, letting go on taking the headset off), a rescue by two boats live.

### Multiplayer batch 3: joining the right game, clearly (26 Oct 2026)

Owner: "go ahead with multiplayer batch 3" (the study's third batch: #6, #22, #24, #13, #4, #26, #8, #20, #23, #30, #34, #19, #32).

- **#6 The host's game, map and address.** The host's world says its mode and folder (`world.build.mode`, `site`, beside `map`). The crew page checks them first on the welcome (`samePageAsHost`): in the other game, on another Voyage map, or on the other address (#30: the live game and /next/), it goes to the host's page with the code and joins from there. The host doesn't take a crew page from another address as "a newer build" (the hello's `site`).
- **#22 A notice before each reload** ("The host is in Voyage: Tayvallich and Loch Sween: loading it and joining", the version one too), `net.reloadNoticeS` 1.5 s before it goes. **Leave game goes back to your own page** as it was before the join (kept in the tab, `swvr.ownPage`): your mode, your map, your own boat.
- **#26** That also drops the host's boat from the address: no "sea trial" of the host's Shipyard boat in your career after following them.
- **#24** The host's chart is taken only after those checks: a refused join no longer leaves the host's pencil marks in your saved chart.
- **#4 Try her together** is a try-out (`isTryOut`, shipyardTrip.ts): no five-minute sea-trial clock (it restarted everyone in the beginner boat), nothing saved to the career. The same for a page following its host into a boat its career hasn't paid for. (My call, open to change: the try-out isn't saved as your career boat; buy her at a yard for that.)
- **#13** The crew page takes the host's world whole (`net/takeWorld.ts`, at the welcome and each snapshot): parts of its own the host hasn't got (its own Voyage plan, its pots) go.
- **#8 Joins give up:** after `net.joinTimeoutS` 20 s with no answer (`joinLoadS` 60 s once the world has started coming), "No answer from game 12345. Is the host's game open and their headset on? Try again". The Crew tab says the stage: reaching the game finder, looking for the host, linked (the world coming).
- **#20 Plain error words** (`plainNetError`, net/transport.ts): "Can't reach the game finder: check the internet…", "Found the host, but your networks block a direct link: try home Wi-Fi or a phone hotspot". Hosting tries 5 times (`net.hostTries`), each wait longer, keeping its own game's code.
- **#23 Old links:** a game link (`?game=`) is tried `net.linkTries` 5 times (not 20), then "Game 99998 isn't open: host your own game or join another", the address cleared. **Stop waiting** on the Crew tab gives up any join or wait (no retry or takeover after it).
- **#34 Desktop:** with the Crew tab open (on your own), the number keys (both rows) type the code, Backspace, Enter joins; pasting a code or a game link fills the box. The 9 and 0 keys' motion coupling waits meanwhile.
- **#19** `npm run crewcheck` reads the join box before the leave's reload, and checks the crew's boat now waits (batch 2): all 27 pass.
- **#32 Docs:** README (no "last code remembered", no restart into the host's boat) and MULTIPLAYER.md (the free relay, the measured snapshot sizes, joining) corrected.
- **Shared changes:** `src/core/world.ts` (`build.mode`, `build.site`).
- **Tests:** tests/takeWorld.test.ts (new), tests/net.test.ts (plain error words), tests/shipyardTrip.test.ts (try-outs), tests/menu.test.ts (hooks).
- **Checked live, two and three browsers through the real game finder:** a Career page joining a Voyage Tayvallich host is told, goes there, joins, and Leave game takes it back to career.html; an old link gives up in about 55 s with the address cleared; crewcheck 27 of 27. **Not checked:** the live game and /next/ together (needs both published), the join time limit against a real sleeping headset, desktop typing by hand, the Quest.

### Multiplayer batch 2: nobody loses their stuff (26 Oct 2026)

Owner: "go ahead with batch 2" (the multiplayer study's second batch: #5, #11, #16, #12, #28, #29, #17, #18), with two answers: a crew-mate's boat **waits 2 minutes**; on a borrowed career, **block boat changes**.

- **#5 Crew boats wait.** A launched boat whose player has gone waits `net.crewBoatGraceS` 120 s (`VesselState.ownerAwayAt`), with her tow and cargo, then goes. Back from the same browser tab (`ownerClient`, the hello's `clientId`, now kept on `PlayerState.clientId`), the player gets her again under their new number and is put aboard her ("…waited for you: you're back aboard") (`core/launch.ts` `stepLaunched`, `reclaimBoats`; HostSession hello). A new crew-mate's number is one no player or waiting boat has, so a stranger never inherits one. Going solo keeps your own launched boat yours.
- **#28 A boat taken away** (handed back, replaced, her owner long gone) sets her cargo down on the game harbour's goods row, casts off her lines, lets go her controls and puts anyone aboard onto the game's boat (`removeBoat`). Launching again keeps the old boat if the new one finds no room.
- **#12 The host launches with crew aboard:** she's put beside the game's boat, as a crew-mate's is, instead of the page starting again (and in a friend's world).
- **#29 A host's reload keeps the world:** as the hosting page goes, its world is kept in the tab (`swvr.hostWorld`, sessionStorage); hosting the same code again within `net.hostWorldKeepS` 180 s, in the same boat, it carries on from there (the crew rejoin; their boats wait). Also when the page updates itself for a newer crew page. Not when changing boat.
- **#16 A borrowed career:** boat changes, refits, the Shipyard and a launch that would start the page again are blocked with a message while the world is a friend's (`borrowedBlocks`).
- **#11 Back to your own game** on the Crew tab when you're alone in a friend's world; Host a game there asks you to press again.
- **#17 Names:** the random first name is saved (it changed on every reload); the host gives a second "Bosun" " 2".
- **#18 Notices:** "X came aboard (n aboard)", "X left the game", on every page in the game.
- **Shared changes:** `src/core/launch.ts` (the wait, `removeBoat`, `reclaimBoats`), `src/vessel/vesselState.ts` (`ownerClient`, `ownerAwayAt`).
- **Tests:** tests/launch.test.ts (the wait, the reclaim, cargo to the quay; 2 new, 1 changed), tests/net.test.ts (names told apart, put aboard the boat that waited; 1 new).
### Multiplayer batch 1: noticing who's gone (26 Oct 2026)

Owner: "go ahead with the multiplayer batch 1" (the multiplayer study's first batch: #21, #10, #1, #2, #9, #14).

- **#1 Heartbeat both ways.** Crew: a host not heard from for `net.hostSilentS` 4 s is "not responding" (or, its snapshots say so, "in the background"), for `net.hostLostS` 10 s lost, as if its link had closed: the wait, then the takeover (ClientSession `silentS`, `lose`; App `heartbeat`). Host: a crew-mate quiet for `net.crewHoldS` 3 s lets go of what they held; after `net.crewSilentS` (now 12 s) is taken out of the world (back as they were if heard from), and no longer counted aboard. The silence is timed by the real clock, not the frames (a slow frame rate mustn't slow it). A tab joining again (its `clientId`, kept in the tab's sessionStorage) replaces its old self at once.
- **#2 Stop hosting ends the game:** the host's `end` message; the crew are told "The host ended the game" and carry on alone; nobody takes over. (A host whose page simply goes says nothing: the heartbeat.)
- **#10 A returning host joins:** a page re-hosting a code of its own (a reload, a takeover, Try her together) that finds it taken joins it as crew, and hosts it again if nobody turns out to be there. A takeover waits for a join under way to finish. `net.takeoverDelayS` 12 → 25 s (time for a Quest to reload).
- **#21 A hidden host keeps the game going:** stepped from a timer (`net.hiddenStepS` 1 s; a background tab's timers), snapshots marked paused so the crew are told why.
- **#9 Crew ride out game-finder blips** (PeerClientTransport: its errors ignored while the link to the host is open, and reconnected). **#14 The host reconnects** to the game finder, waiting longer each time (`net.finderRetryS`); the menu says "reconnecting (new crew can't join yet)", or that another page took the code.
- **Checked:** tests/net.test.ts (3 new). Two browsers through the real PeerJS broker: Stop hosting (the crew told, no takeover after 35 s); a crew page gone silent (its hold on the wheel freed by 5 s, taken out by 15 s); a host gone silent (the crew notice by 14 s and start rejoining). Not checked: the hidden tab (a headless browser can't hide one), the game finder dropping, on the Quest.

### Fix: a crane's load lowered over her own deck goes on her deck (26 Oct 2026)

Owner: since the HOOK message, a cardinal buoy can't be set down on the cargo deck: "not close enough to the water". The message was only saying what the crane had always done: a load set down over her deck needed its whole footprint on clear deck right under the hook (all four corners: a 1.1 m buoy on a small working deck seldom fits exactly), and anywhere else was taken for "over the side", so it wanted the water. Now a load lowered anywhere over her (`overDeck`, cargo/deck.ts: inside her deck's outline) goes on her deck, under the hook or at the nearest clear spot within `DECK_NUDGE` 1.2 m (`deckLanding`, cargo/cargo.ts); with no room near, it stays on the hook and HOOK says "No room on deck there: move the hook over a clear part of the deck"; it's never over the sea. A full deck (payload, slots) says so too. Test: tests/craneDeckSetDown.test.ts (a crane boat, the hook over her deck just off a clear patch: the buoy goes on deck; the old code gave "Lower it right down to the water first").

### Back from the submersible game: salvage crates on deck, the survey and the story paid (26 Oct 2026)

The owner (to the submersible game's chat, which built this, its milestone M9): do both sides of the way back, and merge it to `next` for the round trip; and make the charted wrecks generic, so the submersible game's procedural engine makes them up.

- **The return** (`src/dive/diveReturn.ts`, new; `docs/dive-contract.md` "The return", the same file in both repositories): the submersible game, on recovery, goes back to the `return` address with one JSON envelope in `mv` (base64url, as Timber's): `from: "submersible"`, the handoff id, the site, `items` (kind, class, name, kg in water), `survey` (coverage, gained, named, now), `story` (clues, solved, now, first time). Read and bounded (`decodeDiveReturn`), taken off the address before Timber's look (`takeDiveReturn`), counted once by the id issued at DIVE (`consumeDiveReturn`, through the issued/consumed lists shared with Timber), in the career and in Voyage.
- **What came up:** a **salvage crate** on the dive ship's deck per find (cargo kind `Salvage`, as heavy as the find out of the water, `CONFIG.dive.airFactor`; real deadweight; orange, as lost cargo is). Sold at its price (`CONFIG.dive.prices`, by kind) once she's been stopped in any port for `sellAfterS` (30 s, so you see them aboard first), or carried ashore by hand.
- **Paid on coming back:** the survey (£25 a point of coverage gained this dive, £600 for naming her) and her story (£800 for the cause of loss, +£1,200 first time) (`CONFIG.dive.fees`). New job kinds `salvage` and `dive` (career.ts), at the price given.
- **The sub:** still over the site (a Voyage comes back where she was), afloat astern with the frame out, to recover by hand. Elsewhere (the career comes back in port: it doesn't save her place) on her cradle.
- **Generic wrecks** (owner): `src/dive/diveSites.ts` drops each wreck's name, kind, size and note; a site has `near` (where, in words) and the charts say "Wreck, 27 m" until a dive names her (`foundNames`, `swvr.dive.names`); `siteLabel` for notices ("Diving on the wreck off Brannock"). The Calder Haven site keeps `scenery: 'Margaret Ann'`, so the paper chart marks the visible wreck there once.
- **Shared changes:** `voyage/metaverse.ts` (`consumeIssued`, the id check split out of `consumeReturn`); `cargo/cargo.ts` (`CargoItem.salvage`, its label, paid when carried ashore); `career/career.ts` (job kinds `salvage`, `dive`; `stepCareer` sells salvage); `config.ts` (`dive.prices`, `fees`, `airFactor`, `maxItems`, `sellBelowMS`, `sellAfterS`; the `Salvage` cargo kind, after the trade kinds); `nav/chartPlotter.ts`, `nav/paperChart.ts` (labels); `modules/diveFrame/launch.ts` (the "nearest" notice); `app/App.ts` (`takeDiveBack`, `landDive`, after the career is restored); `docs/dive-contract.md`; README "Dive sites and the submersible".
- **Tests:** `tests/diveReturn.test.ts` (new): the envelope read, bounded, Timber's left alone; counted once, only with an issued id; the crates on deck (names, weights), the fees, the sub afloat over the site and on her cradle away from it, her name for the charts; selling: not at sea, not at once, then each crate in port; no site named or described. `npm test`: 278 files, 1622 tests pass (after merging `next`); typecheck clean.
- **Checked in headless Chromium, the round trip with both games served locally:** career and Voyage (Oban): the dive ship over a site, sub afloat, DIVE → the submersible game at that site with the return address and session → recovered there with an anchor and a bottle and the cause found → back here: the crates aboard (Voyage) or sold in Calder Haven after the wait (career), the fees in the ledger, the notice, the sub afloat astern in Voyage. **Not checked:** VR; a picture of the crates on deck (the headless player was ashore); the live addresses (the local servers stood in).
### Construction projects, step 5: commissioning, and Tarran Rig finished (26 Oct 2026)

Owner: "go to stage 6". The plan's last stage: commissioning crews out by crew transfer; the turbines light and turn; the project done with its bonus.

- **Stage 6, Commissioning** (bonus £2,000): `comm1`, `comm2`, crew transfers of two engineers each (`ProjectJobDef` transfer with `commission: true`), £800 each, through the transfer system as the fitters were. Their crew up: the turbine is commissioned `projectCommission.s` 90 s later (`commissioning`, then `commissioned`, saved; one being commissioned reads back as done), the radio says so.
- **Turning:** a commissioned turbine is drawn by a WindFarmView of its own inside ProjectView (into the wind, rotor turning, lit at night: the map farms' own drawing), made again as each is commissioned; ProjectView no longer draws its still parts.
- **Finished:** the last stage done and every turbine commissioned, the project's done (`completeProject`): its `bonus` £5,000 and double the contract reputation, moved to `CareerState.projectsDone`, `project` cleared. Its farm stands for good (`builtProject`): `foundations` gives it every turbine up and turning, so it's drawn, solid (`projectBlocks`), a crew-transfer farm (`setProjectFarm`), on the plotter (now every farm via `allFarms()`, which also rings a transfer job's turbine on the project's farm), and its marks stay laid (`laidMarks`), on the plotter too.
- **Board and menu:** after the last stage, "every stage done: commissioning, n of 2 turbines generating"; the debug Stage done on the last stage commissions at once, so the project finishes.
- **Tests:** tests/projects.test.ts, 2 new (the crews up, commissioning, then the project done: bonus, projectsDone, the farm standing, solid, its marks, not offered again, saved; a turbine being commissioned saved), 1 changed. Headless: the finished farm by day and night (rotors turning, lights on as Holm Rig's).
- **Shared changes:** none beyond the main game's files (the plotter's farm list now `allFarms()`).

### (From the modular-builder chat) The harbour tug's azimuth drives and levers

The harbour tug's two azimuth stern drives and their twist-and-throttle levers (full write-up: `docs/progress/modules.md`). What moved in shared and game files:
- `src/vessel/physics/propulsion.ts`: `twinStep` takes each engine's own speed of advance (`speed2`, default the same), unchanged for every other boat.
- `src/vessel/vesselState.ts`: `aziAngle`, `aziAngle2`, `aziTransit` in the controls; `azimuth` (each drive's heading) in the engine's state.
- `src/controls/instruments.ts`: the ENGINE screen draws each drive's heading dial when she has them.
- `src/app/interiorDetail.ts`: `control:wheel` added to the parts never hidden from outside the wheelhouse (the tug's small 0.13 m wheel fell under the 0.3 m small-part size and vanished through the windows).

### (From the modular-builder chat) DIVE: the dive support ship opens the submersible game

The dive A-frame's red DIVE (docs/progress/modules.md): with the sub afloat, stopped over a dive site's ring, it saves the game and opens the submersible game at that wreck by the address it reads (`?site=&depth=&sub=&tier=&crew=&return=&session=`). Shared changes: `app/App.ts` (`goDive`, and the DIVE press in the controls' handler); `docs/dive-contract.md` (the launch as built, replacing the proposed `mv` envelope for the way out; the return still to agree, the submersible game's M9). The session id goes in the same issued-ids store as the timber camp's (`swvr.mv.issued`).

### (From the modular-builder chat) A dive support vessel: the dive A-frame and the submersible

The new module `deck.dive-frame` (docs/progress/modules.md): an A-frame over the stern that hoists the submersible game's sub off her cradle, swings her out and lowers her until she floats. Shared changes here:
- `core/simulation.ts`: the sub's weight moved from her cradle as a payload (`modules/diveFrame/onBoat.ts` `diveSubPayload`).
- `modular/busKeys.ts`, `vessel/vesselState.ts`: four hold-to-run keys, `dive.frameOut`, `dive.frameIn`, `dive.winchUp`, `dive.winchDown` (only on a boat with the frame, so the goldens are unchanged).
- `boats/library.ts`, `boats/fleet.ts`, `vessel/vesselDef.ts` (`VESSEL_IDS`): a new fleet boat, `diveShip`, the **Dive support vessel** (in the boat lists).
- `app/App.ts` `hydraulicsHint`: says why the frame or the winch holds (no pressure; the sub not in the docking head; the frame not right in or out).
- For the dive itself (stage 4, not built): the submersible game reads plain address fields (`?site=…&depth=…&sub=…&return=…`, its `src/core/handoff.ts`), not the coded `mv` envelope in `docs/dive-contract.md`.

### (From the modular-builder chat) Twin engines heard one each

`audio/engineAudio.ts` `EngineAudio.update`: a twin's second engine sound now follows the starboard engine (`EngineState.stbd`) when the engines are worked separately, not the port engine's (its start and throttle were silent). `app/App.ts` `updateBoatVoices`: other players' split twins heard by the harder-working engine (still one voice). Test `tests/twinEngineSound.test.ts`.

### A load on the crane hook drawn as smoothly as the crane (25 Oct 2026)

Owner: the crane is smooth now, but lifting cargo from the side, it jerks. The crane's view draws its boom and hook smoothed between the simulation's ticks (mechanisms/tickSmoother.ts), but the load under the hook was drawn straight from the latest tick (cargo/cargoView.ts), so at 60 ticks drawn at 90 frames it stood still one frame in three under a gliding hook. Now each hooked load's hook point (in her axes, so the boat's own motion stays the app's) goes through a TickSmoother of its own, the same as the crane's; just hooked, it starts where the load was drawn and comes up onto the hook (the lift's last half metre) rather than jumping; a jump past `HOOK_SNAP` 1.5 m (a reset, a snapshot) is drawn at once. Test: tests/craneLoadSmooth.test.ts (the crane slewing at 60 ticks drawn at 90 frames: the load moves every frame, evenly; on the old code a frame stands still). All of `npm test`: 1583 passing. Not checked on the Quest.

### (From the modular-builder chat) Diesels stall; twin lever keys

`vessel/physics/propulsion.ts` `engineStep`: in gear and below `stallFraction` of idle (`CONFIG.vessels.workboat.engine.stallFraction` 0.3, the fallback for engines without one; `modules.outboard.engine.stallFraction`), a running engine stalls (phase off). Before, it could sit 'running' at 0 rpm in gear with no alternator charge and flatten the battery (owner's twin trawler). `core/keybindings.ts` + `app/App.ts`: on a twin worked separately, holding the wheel with the mouse, E/D and R/F work the port and starboard levers (`twinLeverKeys`); E, F and R don't do their usual jobs then. See `docs/progress/modules.md`.

### Fix: Step ashore put you at the start harbour from a quay with no named berth (25 Oct 2026)

Owner: moored at Wemyss Bay (the Clyde), the gangway mark's Step ashore took him to another harbour (Rothesay, the map's start). A boat can make fast along any quay face (world/berths.ts `allBerths`: the regions' named berths and one per bollard pair on every seaward face), but the spot ashore was looked up among the named berths only (world/startSpot.ts `quaySpot`, `BERTHS`), so a face berth fell back to the start's quay. Now it's looked up among all of them (`berthWithId`). Test: tests/gangway.test.ts, 1 new (fails on the old code). All of `npm test`: 1578 passing.
- **Shared changes:** world/startSpot.ts (`quaySpot` finds any berth).

### Dive sites: wrecks for the submersible game (25 Oct 2026)

Owner: a submersible launched off a dive support ship will go into its own game to search wrecks with an ROV; this game needs the areas where the wrecks are, like the potting and fishing grounds, some shallow, some deep, some by places of interest; the missions later. Chosen with the owner: both maps, 6-8 sites.

- **Eight sites** (`src/dive/diveSites.ts` `DIVE_SITES`): five on the Oban map by latitude and longitude (real coast, real depths: Selene 12 m off Dunstaffnage, Sound Spirit 13 m off north Kerrera, Morven Lass 28 m off Slatrach Bay, the Gylen wreck 40 m under Gylen Castle, the Lorn Trader 54 m north-west of Maiden Island, the map's deepest water, about 55 m), three in the career archipelago by its metres (the Margaret Ann 8 m, the wreck already there; Ellen Rose 27 m off Brannock; Sgarbh 40 m north of Eilean Garbh, the islands' deepest). Bands: shallow under 20 m, mid to under 40, deep 40 and more (the islands go no deeper). Invented wrecks at real places. Picked by sampling the seabed round the maps' named capes, islets and bays.
- **On the charts:** the chartplotter draws each as a dashed pale blue ring `CONFIG.dive.radius` 50 m round it, the wreck mark, her name and depth; the paper chart a wreck mark with her depth (the Margaret Ann is already there as a wreck).
- **The contract, a draft:** `docs/dive-contract.md`, the site table (ids, positions, depths, the wrecks) and a proposed launch and return in Timber's envelope, with the open questions for the Submersible World chat. This chat couldn't attach the Submersible-World repository (the session's permissions refused it), so it's written from this side only.
- **Tests:** tests/diveSites.test.ts (3: ids and bands, every band on both maps; each career and Oban site at its charted depth on the ground within a few metres, clear of the potting grounds). Headless: the plotter by the Sound Spirit (Oban) and the Ellen Rose (career).

### (From the modular-builder chat) The console screens tidied (owner's list)

`controls/instruments.ts`: the speed screen is the log (`logKnots`: speed through the water, ground speed less `addCurrent` at her position), without the anchor line (`paintAnchor` removed: the anchor has its own screen); the heading screen without the rate of turn (`rateOfTurn` kept, unused on screen); the ENGINE screen without the coolant temperature (on the engine monitor). The round LOG dial reads through the water too. SOG stays on the NAV panel. See `docs/progress/modules.md`.

### Deck crane: HOOK says why it won't let go (25 Oct 2026)

Owner: laying the cardinals, the buoys over the side at their circles, "the button to drop them off didn't work". The crane sets a load down in the sea only once its foot is within `SET_DOWN_ABOVE` 0.8 m of the water (cargo.ts setDown), and a press above that did nothing and said nothing. Now a HOOK press with a load it won't set down shows, to whoever pressed, why: "Lower it right down to the water first: 2.3 m to go (hoist down)", or onto the deck / the ground, or "No room on deck there" (`hookNote`, cargo/cargo.ts, read only, the same rules as setDown; shown by App on the press, so crew see it too). A project buoy lowered at the water but not wanted now (not this stage's) is answered by the office instead of silence (projects.ts `layProjectBuoy`); off its spot was already said. The mechanics themselves were sound: the crane reaches well below the water with its wire run out. Test: tests/projects.test.ts (the crane-laying test now presses too high first: told, still on the hook). All of `npm test`: 1566 passing. Not checked in a running game.

### (From the modular-builder chat) Twin engines worked separately

A twin's starboard engine now has a state of its own (`VesselState.engine.stbd`, made by `starboardEngine`, `vessel/physics/propulsion.ts`), with its own lever and START (`controls.lever2`, `controls.start2`; bus keys `throttle.demand2`, `ignition.start2`, `propulsion.state2`, `propulsion.rpm2`). `toggleEngine` starts both (the starboard one `queued` until the port one catches) and stops both; the 'lever' intent (keys, gamepad, menus) sets both levers once they've been split. `controls/Lever.ts` takes a label and can be worked by another handle (`follow`, `heldBy`). The ENGINE screen (`controls/instruments.ts`) shows both engines when there are two. `app/interiorDetail.ts` keeps the new levers visible through the windows. Only on the diesel module's `twin.split` (twin shaft engines in Shipyard designs). See `docs/progress/modules.md`.

### Multiplayer: an out-of-date host updates itself; no frozen avatars (25 Oct 2026)

Owner: friends joined a hosted career but were "in separate sessions"; then his son's avatar appeared frozen in the host's game, and his son, entering VR, was on his own; tried again, four or five frozen avatars. What happened: on a day of many pushes the host's page was older than the one his son opened from the link. The son's page refused the older host (it reloaded once, still different, and played alone: "the host reloads the page"), and each try left a figure in the host's world, because the host only dropped a crew-mate when their link said it had closed, which a page that goes away often never does.

- **The host updates itself.** Builds compared by their stamp's time (`isNewerBuild`, src/build.ts). A crew-mate newer than the host: the host's page reloads past the cache (`?fresh`), hosting the same game code again, the crew following (App `onOtherBuild` → `restartPage`), once (a page still behind after that says to reload by hand). A host older than the crew page: the crew page waits `net.olderHostRetryS` 6 s and joins again, retrying as "sent in together", instead of reloading or playing alone.
- **Crew who go are dropped.** A crew page says `bye` when it leaves the game, closes or reloads (`pagehide`; protocol.ts `ClientMessage`), and the host drops them at once; the link gets a moment (0.25 s) to send it before it's destroyed. A crew-mate not heard from for `net.crewSilentS` 20 s is taken out of the host's world (their carried things dropped, controls let go) and put back as they were if heard from again (net/hostSession.ts).
- **Checked:** tests/net.test.ts (2 new: the goodbye, the quiet crew-mate gone and back) and tests/build.test.ts (1 new); all of `npm test` 1566 passing. In a locally built copy (the dev server skips the version check), two headless browsers through the real PeerJS broker: a host stamped older than the crew's page updated itself and the crew joined it (2 players); the crew page reloaded three times with the host still seeing 2 players, and closed, the host was back to 1 within 4 s. Not checked: on the Quest, and three players.
- **Also looked at:** the first report (friends in a Shipyard boat): a host on a sea trial whose trial ends restarts with the crew following, which works; the version mismatch is the likely cause there too.

### Debug: a project stage back (25 Oct 2026)

Owner: an option in the debug menu to go back a stage. Debug → Missions → **Project** is now a row of its own: **Stage done** (as before) and **Stage back**: the project to the start of the stage before (the first: its start again), as if every stage before it had been done and nothing since. What those stages built stands (driven piles, pieces on, turbines up, the survey run, the marks), nothing is paid again, and what was about from the stage left (its items on the quay or aboard, a tow, the fitters' transfer, a ship sent for the works) is cleared away (`careerProjectBack`, career/projects.ts `setStage`). Test: tests/projects.test.ts, 1 new.

### Projects: what's next, on the Jobs page and the duty board (25 Oct 2026)

Owner: where do I see what to do next in the project, and whether I've another mission on at the same time? It was only on Office > Projects. Now `projectBoardLines` (career/projects.ts) gives it in two short lines (the stage, its jobs left; the next job, and that a stage's jobs go in any order), shown on Office > **Jobs** under the contract (a Project heading; "None under way" otherwise) and on the **duty board** under the contract line, in orange (duties/dutyBoardView.ts; words and counts only, so the board still redraws only when it changes). The beginner boat has no duty board (nor chartplotter: basic controls), so the Jobs page is the one every boat has. Test: tests/projects.test.ts, 1 new; the board drawn headless with the project at stage 5.

### (From the modular-builder chat) The Your boats board reads the favourites as you walk up, not every second (25 Oct 2026)

Owner, after the 2 fps fix: "It still doesn't sound very efficient to read it every second. Is it not a case of reading them when you walk up to the board?" The favourites (`ShipyardCodes.favourites`, `src/shipyard/takeHer.ts`) are now kept from the last read with no time limit, and read again only when they may have changed: as you come up to a Your boats board (`ShipyardDoor.onOpen`, set by `ShipyardDoor.boats`: `src/ui/shipyardDoor.ts`), when one is saved in the game (`saveBoat`, as before), and when the Shipyard in another tab saves or removes one (the browser's `storage` event for `swvr.shipyard.favourites`). The prices stay remembered as before. Test: `tests/shipyardTrip.test.ts` (one read over 200 frames; once more walking up to the board, kept while it's up; away and back, once more). Not checked by hand: the Shipyard in another tab saving one while the game is open (the browser's own event).

### Fix: 2 fps standing by the Your boats board, with favourites saved (25 Oct 2026)

Owner: the career at about 2 fps on the Quest, and desktop Chrome barely moving; Edge fine. The cause: the **Your boats** board (beside every Shipyard sign, since 25 Oct, 6fa7b0f), shown whenever you're near one (you start a career beside one), works out its page every frame. For each of its four rows that meant reading every favourite back from storage (their pictures too) and, for the "Buy her (£…)" label, **building both your boat and the favourite from scratch** to price them: about 100 ms a frame on a desktop with eight favourites, several times that on the Quest. Edge had no favourites saved, nor had the test browser, so neither showed it. Now `designPrice` (app/shipyardTrip.ts) remembers each code's price (up to 64; a code always builds the same boat), and `ShipyardCodes.favourites()` (shipyard/takeHer.ts) reads the list at most once a second (afresh after saving one in the game). Measured in a headless browser with eight favourites: about 96 ms of work a frame before, under 1 ms after. The menu's Office > Your boats page had the same cost while open and is fixed by the same. Tests: tests/shipyardTrip.test.ts, 2 new. All of `npm test`: 1561 passing.
- **Shared changes:** none (`src/shipyard/takeHer.ts` is the Shipyard area's file, but this is its in-game Your boats list: a small cache, nothing else changed in it).

### Debug: +£50,000 (25 Oct 2026)

Owner: a +50k on the money in the debug menu, to have enough to test with. Debug → Missions → Career → **+£50,000**, beside +£5000, rep (`careerDebugCash` with value 50000: that much money alone, no reputation). Test: tests/projects.test.ts, 1 new.

### Debug: "Project: stage done" takes the project first, and says what it did (25 Oct 2026)

Owner: pressed Project: stage done after spawning in, and nothing happened. It only worked with a project under way (taken at the Calder Haven office), and said nothing otherwise. Now, with none under way, the first press takes the first project not yet done, from anywhere (`careerProjectStage`, career/projects.ts); each press after finishes the stage. A message says which (app/careerSession.ts `debugProjectStage`), or that every stage built so far is done. Test: tests/projects.test.ts, 1 new.

### Front page: "Continue your career" when there's one saved (25 Oct 2026)

Owner: the Career tile says "Start a career" even with a career saved; should it say continue? It carries on the slot last played, so now it says so: **Continue your career**, with a line under it giving the slot and balance and where to start a new one (Menu → Office → Career). A small script in `index.html` reads the same keys as app/careerSession.ts (`swvr.fleetCareerSlot`, `swvr.fleetCareer.N`); no save (or no storage): "Start a career" as before. Checked headless, with and without a save. No config keys, no tests touch it.

### Construction projects, step 4: the turbines and guard duty (25 Oct 2026)

Owner: "go to stage 5". Stage 5 of Tarran Rig, as in the approved plan: the installation ship puts the turbines up in the background while you guard the works and run the fitters out.

- **Installation ship** (`installAt`, career/projectView.ts `installerGeometry`): a set piece like the jack-up, bigger (80 x 36 m hull on four legs, the crane's boom raised over the hub), standing north of the turbine she's on. Each turbine takes `erectS` 240 s of work: the tower rises, the nacelle is lowered on from `nacelleAt` 0.4, the rotor from `rotorAt` 0.65. Turbines that are up are drawn still (one blade hanging down, clear of her boom) in the project's merged mesh; they turn once commissioned (stage 6). Settings: `CONFIG.career.projectInstall`.
- **Guard duty** (job kind `guard`, `stepGuard`): her work goes on only while a players' boat is within `standBy` 900 m of her and no ship is within `zone` 400 m. While guarded, a ship is sent for the works every `every` 50-110 s, one at a time (traffic.ts `spawnShipFor`: from `from` 1700 m on a clear approach, straight at her; `Ship.bound` marks her). A guard boat within `hail` 300 m: she's called on the VHF and alters 70 deg away (whichever side passes further off). Into the zone: a strike, she's turned away by the installation ship, and the guard job pays `strike` £600 less (never under `minPay` £600). The radio says when the guard comes and goes, and each lift. Settings: `CONFIG.career.projectGuard`.
- **Fitters** (job kind `transfer`, `stepFitters`): once a turbine is up, a crew transfer to it (three fitters on the usual crew-transfer quay), through the transfer system: the project's turbines become a wind farm once all their transition pieces are on (world/windFarm.ts `setProjectFarm` / `allFarms`, after the map's own), so the landings, the platforms underfoot, the gangway mark and the technicians' figures all work there. `TransferJob.project` marks the project's: the project pays it (not the transfer as well).
- **Plotter:** the zone (red, dashed), the stand-by ring (faint), the installation ship, the ships bound for the works (red, named), turbines that are up (white).
- **Saved:** `erected`, and guard duty's `warned` / `strikes`; a turbine going up when the session ends reads back as up.
- **Debug:** Project: stage done puts both turbines up and the fitters across.
- **Tests:** tests/projects.test.ts, 5 new (the lifting rules and strikes, ships sent for the works, the guard pay and the fitters' transfer on the new farm, the save, the debug button). All of `npm test`: 1557 passing. Headless screenshots of a turbine going up and of the second one's rotor going on.
- **Not checked:** a whole guard duty played through in real time; the fitters' transfer driven by hand onto the new landings (the landing check is the same code as Holm Rig's, on the new farm).
- **Shared changes:** world/windFarm.ts (`setProjectFarm`, `allFarms`: the wind farm list a project can add to; `inTower`, `platformAt`, `platformSpot` use it); world/view/windFarmView.ts (`nacelleGeometry`, `rotorGeometry` exported).

### Construction projects, step 3: the transition pieces (25 Oct 2026)

Owner: "Go to stage 4."

- **Stage 4, Transition pieces** (bonus £2000; `CONFIG.career.projects`): two jobs. **Transition pieces to the jack-up** (£2500): a new tug's tow, the **transition pieces' barge** (`CONFIG.vessels.tpBarge`: the crane pontoon's hull and handling, two transition pieces standing upright on grillages with sea-fastening struts, drawn with Holm Rig's own transition piece: `world/view/windFarmView.ts transitionPieceParts`, now split out of the turbine's parts), out at the laydown like the monopiles, handed over within `projectTow.toJackUpRadius` (50 m) of the jack-up wherever she stands. Then she lifts the pieces onto the driven foundations one at a time, `projectTow.fitS` (90 s) each (`fitting`, then `fitted`): drawn lowered from 12 m onto the foundation, then standing with its platform and landing. **Bolts and grout for the jack-up** (£900): a **supply** job, four loads of `Building materials` (hand cargo) on the Calder goods row; brought alongside the jack-up (within 45 m, under 0.5 m/s, 6 s: `CONFIG.career.projectSupply`), her crane takes what's aboard (`supplied` counts them; paid when all four are).
- A tow job without a `turbine` is for the jack-up (the barge); a `supply` job is new. Project hand cargo is ordinary hand cargo (only the mark buoys are crane only: `isProjectBuoy`); lost, another is put on the quay.
- The **jack-up** now stays on site through stage 4: at a piece being lifted on, else the next to have one, else (supplies still wanted) the last turbine; gone when the pieces are on and her supplies aboard.
- **Solid:** a turbine base with its piece on takes Holm Rig's blocks (`windFarmBlocks`: the piece up to the platform, and the boat landing's face), so a crew boat can push on its landing.
- Saved: a piece being lifted on when the session ends reads back as on; supplies taken stay counted. **Chartplotter:** the barge ("TP barge"), the ring round the jack-up for the barge and the supplies, foundations yellow once their piece is on. **Debug:** Project: stage done fits both pieces.
- **Shared changes:** `src/world/view/windFarmView.ts` (`transitionPieceParts` exported), `src/config/vessels.ts` (`tpBarge`), `src/vessel/vesselDef.ts`, `src/boats/towHulls.ts`, `src/boats/library.ts`, `src/boats/tow-tpBarge.json`.
- Tests: `tests/projects.test.ts` (the barge out, handed over at the jack-up, the pieces on one by one with the landing solid, the jack-up staying for the supplies and gone after; a supply run in two trips, paid at the last; saved mid-way). Headless (career): the barge with its two pieces, a piece being lowered under the jack-up's hook, a turbine base standing with its platform and landing. Not checked: a full tow and supply run by hand, VR.

### Construction projects, step 2: the foundations (monopile tows and the jack-up) (25 Oct 2026)

Owner: "go ahead with step 2, the monopile tow".

- **Stage 3, Foundations** (bonus £2000; `CONFIG.career.projects`): two jobs, **Monopile 1 to turbine 1** and **2 to turbine 2**, £1800 each. One at a time: a monopile comes out to the **laydown** (`CONFIG.career.projectTow.laydown`: (370, 745), south-west of Calder Haven's mouth, lying north-south, clear of the fairway) and is held there on its moorings (its position pinned) until a towline is made fast; from then on it's free (`ProjectProgress.released`). Stopped within 30 m of its turbine at under 0.4 m/s for 8 s (`handover`), the jack-up takes it: the lines cast off, the tow gone from the water, the job paid, and the pile **driven** over `driveS` (120 s) in the background (`driving`), then a **foundation** (`driven`). The next monopile comes out once the jack-up's free. A pile being driven when a session ends counts as driven on the next load (`parseCareer`).
- **The monopile** (`CONFIG.vessels.monopile`, `tow/towLook.ts`): a new tow kind, a 40 m x 5 m steel tube (the farm's pile radius) floated with its ends sealed: 190 t at 1.9 m draught, drawn as the tube with orange bulkhead caps, yellow bands, lifting trunnions and a towing bridle to its eye; floated on a hard-chine hull fitted inside its section (deck edge and chine on the circle, the generator's fining forward end inside the tube). LCB from `uprightHydrostatics` so she floats level; her centre of gravity set low enough for the sea-trials rule (GM over 0.35 m, a righting arm out to 60°). A tug's tow (`needs: 'tug'`, the 3x hawser) and a project's (`TowLook.project`): never a random call or a debug size pick.
- **Only a tug tows it** (owner: "the tug should do the tows ... if they're over a certain size"): `towTargets` leaves a project's tug tow out for a boat that isn't tug class (`isTugClass`: the tug diesel or the heavy towing post). Ships (the coaster) stay open to any boats together, as before (multi-boat towing).
- **The jack-up** (`career/projectView.ts`, `CONFIG.career.projectJackUp`): a set piece, no physics: a yellow hull 40 x 30 m standing 14 m up on four square legs banded red and white at the top, the accommodation block and helideck on its north side, the crane on its south side with its boom set to put the hook over the turbine. It stands 55 m north of the turbine it's working on, moving to the next as the piles go in; gone when they're all in. One merged mesh, one draw call. The pile being driven: a tube scaled from pitched (top +14 m) down to driven (+4 m); the foundations, one merged mesh.
- **Solid:** the game can now add blocks to the collision beside the map's (`world/geography.ts setExtraBlocks`: a short list walked after the map's grid, nothing allocated per probe; solid and standable, but no berths, nothing to climb onto). The project's (`projectBlocks`, kept in step by `syncProjectBlocks` on the host's tick and the crew's frames): each foundation and the pile being driven, the jack-up's four legs, and the laid buoys (small and fendered: a boat leaning on one is nudged off).
- **Chartplotter:** each monopile where it lies (a magenta bar, "Pile 1"), its hand-over ring at the turbine, the foundations as grey discs. **Menu:** the jobs say where the pile is (at the laydown, in tow and how far to go, handed over and how far driven).
- **Debug:** Project: stage done also clears and drives the monopiles.
- **Shared changes:** `src/world/geography.ts` (`setExtraBlocks`), `src/config/vessels.ts` (`monopile`), `src/vessel/vesselDef.ts` (the tow kind, `TowLook.project`), `src/boats/towHulls.ts`, `src/boats/library.ts`, `src/boats/tow-monopile.json`.
- Tests: `tests/projects.test.ts` (the laydown and its moorings, one pile at a time, only a tug can make fast; hand-over pays and starts the drive, the jack-up there, the foundation solid when driven, the next pile out and the jack-up moved; saved mid-drive reads back driven), `tests/monopileTow.test.ts` (floats level at 190 t, stable; the small tug tows it at a few knots, line held, upright), `tests/tow.test.ts` (project tows left out of the size list). Headless (career): the monopile at the laydown, the jack-up on site, the pile pitched and part-driven under its hook, the foundation standing. Not checked: a whole tow by hand, VR.

### Timber logs £2,000 each (25 Oct 2026)

Owner: "the base price of a log should be 2,000, and eventually when we get really big ones, that could be up to 10,000."

- `CONFIG.voyage.timber.logPrice` 2000: a timber camp log sold at the merchant (`stepTimberLogs`), and each log of a saved barge (`saleOffer`, `sellBarge`, `saleText`).
- It's still paid through `earn('log')`, so the harbour's reputation bonus and buyer factor apply on top, and it counts toward a log contract. For that, `career.ts` `EarnOpts.base` lets a job give its own base pay.
- Washed-up salvage in the career keeps `CONFIG.career.pay.log` £180: £2,000 there would swamp the career's other jobs (£50-500). Owner to say if those should rise too.
- Up to £10,000 for big logs needs the camp to send each log's size in the handoff (it sends a count): later, with bigger trees.
- Tests: `tests/metaverse.test.ts` (a sale pays at least `logPrice`). Typecheck clean, all tests pass. **Shared changes:** none.

### Construction projects, step 1: the system, Tarran Rig's survey and marks (25 Oct 2026)

Owner, approving the plan: "keep the existing wind turbine farm ... we're going to build another one as the first project. It can be smaller, like 2 turbines ... The tug should do the tows ... if they're over a certain size, and ... any kind of boat that's got a big enough deck crane could do the buoy laying ... big ships' jobs happening in the background."

- **The project system** (`src/career/projects.ts`): a project is offered at a harbour office (Office > **Projects**), one at a time; it runs in stages, each a handful of jobs done in any order by any of the players' boats. Each job pays when done, each stage its bonus when its last job is, the project its bonus at the end. Progress is the career's (`CareerState.project`, `projectsDone`), saved with it (`serializeCareer` / `parseCareer`, an addition: older saves read as before). Voyage has none. Multiplayer: it's the host's career, in the snapshot like the rest of the world.
- **The first project, Tarran Rig wind farm** (`CONFIG.career.projects`): two turbines in 40 m of open water about 1.1 km north of Calder Haven, at (350, −420) and (600, −420), landings facing south; clear of Holm Rig, the fishing grounds and the other marks (checked against the seabed). Offered at Calder, no reputation needed.
  - **Stage 1, Survey the site** (bonus £800): three survey lines east-west across the site, £450 each, and the met buoy, £600.
  - **Stage 2, Mark the site** (bonus £1000): a north, east, south and west cardinal boxing the zone, £600 each.
  - Stages 3-6 (foundations with the floated monopile tow and the jack-up, transition pieces, the turbines, commissioning) are the next steps; until then the project waits after stage 2 ("the next stage is being planned").
- **Survey lines:** a line counts where a boat runs along it (either way, within ±25°), within 30 m of it, at 2.5-6.5 kn; it's cut into 13 stretches, and it's done when all are run (`CONFIG.career.projectSurvey`).
- **Mark buoys:** each waits on the office's quay as crane cargo (a new kind, `Mark buoy`, 420 kg, buoy yellow), so only a boat with a deck crane big enough lifts it. Lowered into the sea within 25 m of its spot (`CONFIG.career.projectBuoy.radius`) it's laid and paid; anywhere else it stays on the hook and the office says how far off it is; lost overboard, another is put on the quay. Laid, it's a lit mark like the map's (`career/projectView.ts`: the sea-mark view, now able to draw any list of marks).
- **A special mark** for the met buoy: yellow, a yellow X topmark, Fl(5)Y 20s (IALA), in the mark kinds, the lights, the 3D marks and the paper chart's symbol.
- **On the chartplotter:** the site's turbine positions (dashed rings), the stage's survey lines in dashed magenta with the stretches run in green, and each buoy's spot (a magenta ring its radius wide, named) until it's laid, then a mark.
- **Debug:** Debug > Missions > Career > **Project: stage done** finishes the stage's jobs (paid as usual).
- **Shared changes:** `src/world/defs.ts` (`MarkKind` gains `special`), `src/world/navMarks.ts` (its light), `src/world/view/navMarksView.ts` (its shape; the view takes a list of marks), `src/nav/paperChart.ts` (its symbol), `src/core/simulation.ts` (`stepProjects`), `src/config.ts`.
- Tests: `tests/projects.test.ts` (offered at Calder only; a survey line counts only along it, close, at survey speed, and pays when run; a buoy waits on the quay, laid only at its spot, replaced when lost; stage bonuses and the next stage; saved and read back; a real deck crane lowering the buoy from its hook at the spot lays it). `tests/menu.test.ts` stubs. Headless (career): offered and taken from the menu, the met buoy yellow on Calder's quay, both stages finished by the debug button (£6,150 paid), the north cardinal laid and lit on station.

### Timber logs pay the game's log price (25 Oct 2026)

Owner: keep the price for logs that's already in the game, not £12.

- A timber camp log sold at the merchant is now paid as a washed-up salvage log is (`voyage/timber.ts` `stepTimberLogs`, through `career.ts` `earn('log')`): `CONFIG.career.pay.log` £180, with the harbour's reputation bonus and its buyer factor, and it counts toward a log contract there.
- A barge saved before the logs went on the beach sells at the same price a log (`saleOffer`, `sellBarge`, `saleText`).
- `CONFIG.voyage.timber.pricePerLog` (£12) is gone.
- Tests: `tests/metaverse.test.ts` (the sale pays at least half the log price and posts "Timber log sold"). Typecheck clean, all tests pass. Not checked: by hand or in VR.

### (From the modular-builder chat) A TV that shows a browser tab

`world.tv` (who is showing a tab on which TV) with the `tvCast` intent and its tick in `core/simulation.ts`; `App.ts` works the TV's press (`pressTv`) and its frame update (`updateTv`); `net/voice.ts` leaves calls marked `{ tv }` to the TV (`modules/furniture/tvCast.ts`), which sends the picture player to player over the same PeerJS link; the mixer's FM slider is now "FM radio & TV". See `docs/progress/modules.md`.

### The timber camp's logs on the beach, not a barge (25 Oct 2026)

Owner: "dragging the logs down to the shore is fine, but they should spawn not as a barge in the boat game. They should spawn as logs on the beach, because we already have that mechanism." One tow per log is fine; the owner will set up rafting from this side later.

- **Back from the camp with logs** (`voyage/timber.ts` `logsFromCamp`), they're laid on the site's beach (the contract's beach point, the head of Ardantrive Bay):
  - side by side, `voyage.timber.beachSpacingM` 1.2 m apart along the shore, each pointing out to sea (toward the hotspot);
  - its middle where the ground going down to the water is first under `beachMaxAboveM` 0.5 m (beached, not afloat);
  - up to `maxLogs` 40.
- **They are the log salvage's logs** (`salvage/salvage.ts`), marked `timber`, with their own `mass` (`logKg` 170, from `logMass`, also used by the towline in `tow.ts`):
  - put a line on one (the hook, or Make fast), ease ahead, and it slides off the beach and floats;
  - they never go with the tide;
  - only the timber merchant buys them (`stepTimberLogs`, stepped after the salvage in `core/simulation.ts`): afloat and slow (`tow.deliverSpeed`) within `sellRangeM` 15 m (plus half the log) of the merchant's quay for `tow.deliverTime`, then the line comes off, `pricePerLog` £12 is paid, and the radio says how many are left.
  - A log on the line says "tow it to the timber merchant's quay" in the status line.
- **Kept with the Voyage save** under their own key, `swvr.voyage.timberlogs.<map>` (`timberLogsToSave`, `parseTimberLogs`, `restoreTimberLogs`), so the live game's saves aren't touched.
- **The barge:**
  - `bargeFromCamp` and `voyage.timber.bargeOffM` are gone.
  - A barge saved before this still comes back, tows and sells as before.
  - The envelope is unchanged: Timber still sends `barge_ready`, which now means "logs to collect", so the live game (still making barges) and this one both understand every Timber.
- **The log drawing** (`salvage/logView.ts`): room for 64 logs, up from 6 (with 6, most of a camp's logs would have been invisible). The camp's logs are drawn at their own 0.3 m across (`voyage.timber.logDiameter`), not the 0.6 m washed-up trunk.
- `docs/metaverse-contract.md` (the same file in Big Timber, which no longer shows a barge either), README's timber run.
- **Tests** (`tests/metaverse.test.ts`):
  - 40 logs laid, all beached just above the water near the beach point, none on another;
  - still there after the salvage's expiry time with the boat far off;
  - one afloat by the merchant's quay sold for £12, one by another harbour not;
  - a log pulled off the beach by the pilot boat under power, from water deep enough 26 m off;
  - the logs kept with the save;
  - a barge saved before still restored on the line.
- **Checked:** typecheck; all tests. Headless (Oban, a return envelope with 20 logs): 20 logs on the beach at the head of the bay, seen from the wheelhouse 50 m off as a row at the water's edge.
- **Not checked:** towing one across to Oban by hand; VR.
- **Shared changes:** `src/core/simulation.ts` (one line: `stepTimberLogs` after `stepSalvage`), `docs/metaverse-contract.md`.

### Your boats on a board on the quay (25 Oct 2026)

Owner (from the backlog): "The favourites screen as a board on the quayside. Your saved boats would be on a board ashore, worked like the boatyard board and the Shipyard sign: pick one and take her out."

- **A Your boats board beside every Shipyard sign** (`ui/shipyardDoor.ts`: `ShipyardDoor.boats`, its rows `boatsBoardRows`): in the career at every harbour, to the left of the sign; in Voyage on the planning table's other side from the sign. It shows the boat you're in, your Shipyard favourites saved in this browser five to a page with ◀ ▶, and beside each the same button as Office > Your boats (`takeDesign`, `takeLabel`): in the career a 5-minute sea trial, or at a boatyard "Buy her (£…)"; in Voyage, take her. The game starts again in her, as from the menu.
- `ShipyardDoor` is now the quay sign for both (its constructor takes the rows; `ShipyardDoor.shipyard`, `ShipyardDoor.boats`; a `side` offset along the sign's right). Settings: `CONFIG.voyage.boatsBoard` { width 1.2 m, besideM 0.3 m }; height, range and reach are the Shipyard sign's.
- Office > Your boats stays, with the code keypad (the board has no keypad: favourites only).
- Tests: `tests/shipyardSign.test.ts` (the board lists the favourites a page at a time, its button takes the one pressed). Typecheck clean, all tests pass. Headless (career, Calder, two favourites saved): the board stands left of the Shipyard sign with both boats; at the yard their buttons read "Not enough money" on a new career (the buy price), as in the menu. Not checked: Voyage by eye, VR.

### Held controls stay held in VR; W/S on the wheel with the mouse (24 Oct 2026)

Owner: "revert the fix you put in for the VR wheel and throttle controls. When I grab them, I want to be locked onto them. Doesn't matter if I move my body away from them. And ... if you're on mouse and keyboard and you grab the wheel, that you can use the W and S keys for the throttle instead of the cursor keys."

- **The breakaway is gone** (it was the review's fix, Oct 2026): a held lever, wheel, joystick or gear selector is held for as long as the grip is, however far your body moves. With it go the rules it brought: while a hand holds a control, the sticks walk and turn you again and the free hand pulls you along again. Removed: `CONFIG.interaction.breakaway`, `InteractionSystem.holdingAny`, `Control.carried` (only the breakaway read them) and the breakaway test.
- **W and S work the throttle while the mouse holds the wheel**, not only in helm mode (H) as before: `App.handleDebugDriving` takes W/S when `interaction.desktopHeld` is the wheel. Walking was already off while the mouse holds a control, so W/S were free. The neutral detent is as at the helm: S stops at neutral; let go and press again for astern.
- Checked: typecheck, all tests. Headless (career, beginner boat): W with hands free walks, the throttle stays at 0; holding the wheel, W took it to 0.45 ahead and S back to neutral, where it stopped. Not checked: VR (the breakaway's removal is a straight revert to how it was before).

### The bow fender at the yard (24 Oct 2026)

Owner: "we've now got crew transfer in the missions in career mode, but I need to build a new boat for that. Maybe a quick way to test it is just to add it to the upgrades", then "Go ahead with the bow fender on the yard upgrades".

- **A new yard add-on, Bow fender, £6000** (the Shipyard's price, `CONFIG.shipyard.bowFenderPrice`), no reputation needed, sold at Calder Boatyard. Like the searchlight and fire monitor it's a change to the beginner boat's design (`design: { bowFender: 1 }`, the Shipyard's own bow fender, modules/bowFender): bought, the game starts again with her refitted, the black rubber block on her stem, and her `pushFender` gear, so on a turbine's landing she pushes on its rubber and grips (transfer/transfer.ts `landedOn` reads it).
- **Only the beginner boat takes it:** a new `CareerUpgrade.boats` (vessel ids); on the old workboat the yard says "Not on this boat". A refitted Shipyard boat gets hers in the Shipyard (Hull step, Bow fender) through the quay sign. A career saved before the starter boat (no `kit`) is given all the old workboat's equipment as before, not the bow fender.
- Price note: the Debug cash button gives £5000, so it takes two presses to afford it in a test.
- **Shared changes:** `src/world/regions/home.ts` (the map chat's file): `bowFender` added to Calder's `economy.sells` list, one word. `src/config.ts` (the upgrade, `CareerUpgrade.boats`), `src/career/career.ts` (the rule; the old-save grant).
- Tests: `tests/starterBoat.test.ts` (not fitted to start; £6000 at Calder; bought, she has the module and its push-fender probes; not on the old workboat); `tests/starterWorkboat.test.ts` lists updated. Typecheck clean, all 1511 tests pass. Headless (career, Calder): bought from the yard board with debug cash, the money went from £10,500 to £4,500, the game restarted with her refitted and the block on her bow. Not checked: a crew transfer run with it, VR.

### (From the modular-builder chat) Crew transfer jobs: small changes in the main game's files

At the owner's word (24 Oct 2026, crew transfer to wind farms, stop 2): a new gameplay system `src/transfer/` (`WorldState.transfer`, stepped in `core/simulation.ts` after the salvage; its debug intents `transferCall`, `transferPlace`). Small changes: `career/career.ts` (job kind `transfer`; `CONFIG.career.pay.transfer`, `transferPerPerson`, `rep.transfer` in `src/config.ts`), `player/gangway.ts` (Step across / Step aboard at a turbine), `player/playerControl.ts` (the `board` intent's `turbine:` ref), `world/landWalkArea.ts` (a turbine's platform is ground), `nav/chartPlotter.ts` and `nav/paperChart.ts` (the turbines), `ui/mainMenu.ts` (Tests → Wind farm), `app/App.ts` (the technicians' view), `tests/menu.test.ts`. Details in `docs/progress/modules.md`.

### A Shipyard sign at every career harbour (24 Oct 2026)

Owner: "I thought I had added the shipyard as a button which took you to the shipyard with your current boat in voyages. I guess that should be in career mode too", then "any harbour".

- **The career now has the same quay sign as Voyage, at every harbour** (`ui/shipyardDoor.ts`: `careerShipyardSpots`, `updateAt`): one stands behind each harbour's cargo berth (or its first berth), on the spot Voyage's planning table would take there (`planTableSpot`: level ground, clear of the buildings, a little back from the water), shown when you're within 25 m. One button: open the Shipyard on her design, in refit mode, as the yard's door does. The boatyards' own boards keep their button too.
- **Any harbour:** the "Bring her into the boatyard first" rule is gone; the other rules stand (the host only, alone or with no crew aboard, a Shipyard design, not on a sea trial). The refit still costs the price difference, paid on the way back (`settleRefit`).
- The sign reads the Voyage sign's settings, `CONFIG.voyage.shipyardSign` (size, height, range, reach).
- Tests: `tests/shipyardSign.test.ts` (a sign at every career harbour with a berth, on the quay). Headless (career, Calder Haven): the sign stands at the start quay, opens when you step ashore within range (screenshot: on the quay beside the yard shed). Not checked: the other eight harbours by eye, VR.

### Hull weathering (24 Oct 2026)

From the texture study (scratch, reported to the owner: the game's "pixel paint" tiles are the texture system; hull weathering was the first pick). Owner: "Go ahead with the hull weathering", then "these weathering and rusted texture should be an option in the shipyard, actually, so you can pre-configure a boat to look used or new."

- **A new paint tile, `topsides`** (`render/pixelPaint.ts`), on every hull's sides, transom and bow plate: the paint faded in soft patches, a band of grime along the waterline, a dirt line under the deck edge with rust runs down from it, and a few fender scuffs low down. In colour (the rust is rusty): it multiplies to orange on a white hull and a dull dark streak on navy, so a light livery shows it far more. Still mid-grey on average (the tile test), so a hull's colour doesn't shift.
- **It stands the freeboard high instead of repeating in metres.** `hullMesh.ts hullPaintUvs` gives the topsides vertices coordinates of metres along her (across her on the transom) and the height as a fraction of the freeboard there (0 at the design waterline, y = 0, 1 at the deck edge, `hullPlan.deckY`), so the grime sits on the waterline and the runs start at the deck edge on any hull, with or without sheer. Below the waterline (the transom, a chine under water) the shader fades it out. The deck keeps its non-slip, in metres.
- **New or used is the boat's own:** `Livery.weathering`, 0 as new (plain paint, as before) .. 1 well used, set on her hull's material (`setHullWeathering`; the hull is its own mesh and material already, so no new draw call). A hull with none (the fleet's boats, the harbours' and the tows) takes `CONFIG.pixelPaint.weathering.strength`. The Shipyard's "new / used" choice is the Shipyard chat's to add (a message sent: write `livery.weathering` from the design); until then every boat is "used".
- **Cost:** no new shapes, draw calls or dependencies; one texture read on the hull's pixels, as the other tiles; the tile adds 16 KB to the paint texture.
- Config: `pixelPaint.weathering` { strength 1, fade 0.07, grime 0.11, runs 7 } and `tileMetres.topsides` 3.
- **Shared changes:** `src/render/pixelPaint.ts` (the tile, `setHullWeathering`, the shader's topsides case), `src/vessel/view/hullMesh.ts` (topsides faces painted, `hullPaintUvs`, `hullMaterial`), `src/vessel/vesselDef.ts` (`Livery.weathering`), `src/config.ts`.
- Tests: `tests/pixelPaint.test.ts` (the tile's average; a built hull's topsides carry the tile at the freeboard fraction; the livery's amount on the material). Typecheck clean. Headless (Oban, pinned weather): the navy pilot boat shows a faint mottle and runs; her topsides recoloured white in the browser show the grime band and fade clearly; zeroing the amount gives the plain hull back; draw calls unchanged (182). Not checked: in the headset, other liveries in the game.

### (From the modular-builder chat) The wind farm's view in App

At the owner's word (24 Oct 2026, crew transfer to wind farms): `src/app/App.ts` makes a `WindFarmView` (world/view/windFarmView.ts) from `WIND_FARMS`, adds it to the scene and updates it each frame beside the skyline (three lines). `tests/regions.test.ts` counts two blocks per wind turbine. Stop 2 (the transfer job, technicians, the chart) will touch the career jobs; it'll be noted here. Details in `docs/progress/modules.md`.

### Debug weather by hand (24 Oct 2026)

Owner: "an option in the debug menu to turn [live weather] off and to override it ... a wind slider, rain slider and wave height slider instead of the current settings ... and the ability to switch back to real-time weather."

- **Debug → World → Weather** now has the source row (**Live weather** in Voyage, **Game's own** in the career; **Manual**; **Fast ×10**), a readout of what it is now, and four rows of stops as sliders. The menu has no drag sliders, so a stop lights along with all below it. The rows are **Wind** 0–50 kn, **From** 8 points, **Rain** none to torrent, and **Waves** Hs 0–3 m plus **max**. Pressing any stop makes the weather manual: it's in at once and held (no director). Live weather / Game's own gives it back: the live weather as it came in, fetched afresh too, or else the game's own from where it stands. A live fetch arriving late doesn't overwrite weather set by hand. The old preset, Fixed and sea-state rows are gone.
- **Rain** brings the cloud down and the visibility in with it. The preset (sky, lightning, forecast words) is picked from the values the way live weather picks it (`presetFor`).
- **The biggest sea raised to about Hs 6 m** (owner: "try raising the max sea to about 6 m"): `CONFIG.ocean.maxSeaScale` 3 → 5 (Hs 3.6 → 6.0 m in open water; harbours and lochs are sheltered below that). The crests still don't loop: the Gerstner factor Σ Q·k·A is 0.46 at scale 5 (0.37 at 3), well under 1, and the overfalls test (the roughest sea in the strongest race) passes at the new cap. The wind's own sea keeps the old cap, new `CONFIG.weather.windSeaMax` = 3, so the game's own weather and a forecast's wind raise no bigger sea than before; 6 m comes only by hand or from a marine forecast. The **Waves** stops are 0, 0.5, 1, 1.5, 2, 3, 4, 5 m and **max**. Checked headless at Dunbeg anchorage (sheltered: Hs 5 m asked for, no errors); not looked at in open water or in the headset.
- Status lines: the weather line says "set by hand (Debug)"; Voyage's live-weather line says "Weather set by hand (Debug > World)".
- Code: `environment/weather.ts` (`ManualWeather`, `setManualWeather`, `endManualWeather`, `presetFor`, `liveSaved`); intents `weatherManual` (value: 0 wind m/s, 1 from°, 2 rain, 3 Hs m; `args[0]` the value) and `weatherOwn` in `environment/timeOfDay.ts`; menu `ui/mainMenu.ts`; host `app/App.ts`. Multiplayer: host-authoritative like every env intent, so a crew-mate's press goes through the host.
- Tests: `tests/manualWeather.test.ts` (set, held an hour, calmed, back to live; back to the game's own); `tests/menu.test.ts` updated. Typecheck clean; all 1494 tests pass. Headless (Voyage, Oban): wind 40 kn S, heavy rain and max waves gave a Squall with Hs 3.6 m and rain, and Live weather gave it back, no page errors. Not checked: in the headset.

### Career boats cost money: sea trials and buying at the yard (owner, 24 Oct 2026)

Owner: "the free career boats fix next"; asked the rule: "A sea trial is time limited to 5 mins". The review's finding: any Shipyard design could be sailed in the real career for free (Office > Your boats > Take her, a pasted code, the Shipyard's "Try her in the game").

- **Sea trial** (`src/app/shipyardTrip.ts` isSeaTrial, `src/app/App.ts`). A career page started in a Shipyard design the career hasn't paid for is a trial: not her own `CareerState.design`, not a purchase or refit coming back (`refitFrom`), not a crew-mate joining.
  - It lasts `CONFIG.career.seaTrialS` (300 s of game time). It says so at the start, warns at a minute and at ten seconds, then restarts in the career's own boat.
  - Nothing is saved during it (`savesHere()`).
  - The Shipyard door is closed during it ("Not on a sea trial: in your own boat"), so a refit can't be priced from a boat not paid for.
- **Buying at a boatyard** (Office > Your boats, `takeOffer`): at a yard, Take her reads **Buy her (£X)**, the difference in the Shipyard's price from the career's own boat (as a refit, nothing back for a cheaper one), or "Not enough money". Pressing it restarts in her with `refitFrom`, and the career pays and keeps her (settleRefit). Away from a yard: **Sea trial (5 min)**. Voyage is unchanged (free: the sandbox).
- Tests: `tests/shipyardTrip.test.ts` (the trial rule: not for her own boat, a purchase coming back, crew, or Voyage).
- Checked headless:
  - a "Try her" address started a trial; £777 earned in it never reached the save; at a minute it warned, at the end back in the beginner boat with saving on;
  - at Calder Haven with £400,000, "Buy her (£209,000)" for the pilot boat bought her (£191,000 left), and Career from the front page started in her.
- Known, left: the beginner boat's yard add-ons aren't in her design's price (the review's refit finding), and "New career" or a slot switch keeps the boat in use until the page restarts.

### No hitches from the short seas' field, and less garbage from the wave sums (owner, 24 Oct 2026)

Owner: "the wave sampling garbage and wind-sea field hitches next" (review: the field was worked out again in one go, 10-20 ms on the main thread, every time the wind moved 4 % or 4°, and a rising wind did it dozens of times; the wave sums made thousands of throwaway objects a frame).

- **The field a slice at a time** (`src/ocean/windSea.ts`):
  - A refresh is worked out `CONFIG.ocean.fetchSeas.sliceCells` (4000) cells a tick, the old field in use meanwhile, and swapped in whole when done: the Clyde's 25,000 cells in about 7 ticks.
  - The first field (the map's loading, or Debug turning short seas back on) is still made at once.
  - The long waves' exposure is kept for the map (it never changes); nothing is allocated per cell.
  - Every wind direction's fetch is worked out when the grid is made (`src/world/fetch.ts`), not first thing when a new wind comes.
  - Measured (Node), a wind rising 5 → 17 m/s and veering, warm:

    | | Before | After |
    |---|---|---|
    | Each refresh | 10-18 ms at once | 1.4 ms (Oban) / 2.0 ms (Clyde) for the longest single call, none over 2 ms |

    The map's load does a little more (the grid with all its sectors: 35 ms Oban, 50-65 ms Clyde, was 7 / 25 ms; the first field 22-35 ms, was 37-57 ms).
  - Checked in a browser on the Clyde: as the wind rose the field refreshed and the drawn sea took each new one, no errors.
- **Less garbage from the wave sums** (`src/ocean/waves.ts`, `src/vessel/physics/vesselPhysics.ts`):
  - `sampleSurface` fills a sample given to it (`newSurfaceSample`), and the physics keeps six of its own, instead of a new object and two arrays per sample, dozens a tick.
  - The closures and arrays went in the previous change set (the wind-sea lookup, the rest position).
  - The physics' recorded traces (`tests/golden.test.ts`) are unchanged.
- **Two smaller ones** (`src/app/App.ts`):
  - the debug readout's text is built only while the overlay is shown (it was built every frame regardless);
  - the boards' menu list is kept, not made again three times a frame.
- **Shared changes:** `src/vessel/physics/vesselPhysics.ts` (reused samples), `src/world/fetch.ts` (all sectors at the grid's making).

### Harbour boats, buoys and marks cheaper on the waves (owner, 24 Oct 2026)

Owner: "the harbour boats and buoys performance fix next" (review: in a busy marina, where every Voyage starts, the scenery's wave samples were about 10 ms a frame before anything was drawn).

- **Every wave sample is cheaper** (`src/ocean/waves.ts`, `windSea.ts`), for the boats' physics as well as the scenery:
  - the factors (shelter, tidal races, the wind sea) are taken once per sample, at the point, not again at each of the rest-position search's six steps (they change over hundreds of metres; the rest position is within a metre or two);
  - the wind-sea lookup no longer makes two throwaway functions per call;
  - the height and the full sample stop making new arrays.
  The physics' traces (`tests/golden.test.ts`) and the wave tests are unchanged.
- **The scenery asks less of the waves:**
  - `CONFIG.ocean.sceneryIterations` (3): the scenery's samples search for the rest position in 3 steps, not 6. They're within 5 cm of the full sample in a moderate sea and 20 cm in a storm (`tests/sceneryWaves.test.ts`).
  - Harbour boats (`src/world/view/harbourBoatsView.ts`): posed every frame within `everyFrame` (150 m); out to `bobDistance` every 2nd frame; beyond, every `farEvery`th (4), taking turns. The last pose is held between, and the swing to the wind is still worked out every frame. A moored boat's buoy takes her height instead of a sample of its own. The Quest's `bobDistance` goes 400 → 250 m. A per-frame Map is now kept.
  - Marks (`src/world/view/navMarksView.ts`): every frame within 300 m, every 4th within 2 km, every 16th beyond (`CONFIG.navMarks.wavesEvery`). Their lights flash on time every frame. A per-mark array each frame is gone.
- **Measured** (Node on this machine, the review's own benchmark):

  | | Before | After |
  |---|---|---|
  | One wave sample | 13-14 µs | 4.5-7.6 µs |
  | Harbour boats, Oban's busiest marina (94 boats) | 4.5 ms/frame | 1.0 ms/frame |
  | Harbour boats, the Clyde's busiest (301 boats, desktop settings) | 11.9 ms/frame | 1.7 ms/frame |

  The Quest is slower in absolute terms; the share saved is the same.
- Checked headless on Oban: 130 harbour boats posed, every matrix sound, the boats on the water by the pontoon (screenshot). Not checked on the Quest itself (frame times there).
- **Shared changes:** `src/world/view/harbourBoatsView.ts`, `src/world/view/navMarksView.ts` (as above), `src/config.ts` (`ocean.sceneryIterations`, `harbourBoats.everyFrame/farEvery/bobDistance`, `navMarks`).

### The review's quick fixes, and weather that changes (owner, 24 Oct 2026)

Owner: "go ahead with the seven quick fixes and the weather" (from `docs/REVIEW_2026-10-24.md`; eight were listed, all done).

- **Go to some harbours did nothing** (`src/core/launch.ts`, shared): the anchor-spot search was given a list of boats with an empty entry for her own and threw. It now gets the other boats and `anchorSpotFor` (the anchorage circle, depth, the harbour boats' moorings). A failing Go can no longer stop the tick either (`src/core/simulation.ts`, shared: caught, she lies as the plain Go puts her). Test `tests/voyageGo.test.ts`: every Tayvallich harbour, Ashfield included, made fast. It fails on the old code.
- **Leaving a friend's game saved their career over yours** (`src/app/App.ts`): a world adopted from a host is marked `worldBorrowed`. Nothing in it is saved here: career, chart marks, notes board, rescues, batteries, Voyage place, plan and barges (`savesHere()`). Leave game then reloads your own game. Checked with two headless browsers on career.html: the crew-mate's slot (£111) held through joining a host (£999) and leaving, and the page came back in their own career.
- **VR messages cut off at ~30 characters on the wrist** (`src/debug/overlay.ts`): their own card, word-wrapped (largest type that fits, up to five lines), low in the view, with a buzz on the left hand. `CONFIG.debug.vrToast`: width 0.62 m, 1.25 m out, 0.34 m down, pulse 0.3 for 30 ms. The wrist panel keeps the debug readout. Rendered headless: the long start-up message wraps to four lines, about 2.4 cm tall in the headset.
- **A held control followed the body** (`src/controls/InteractionSystem.ts`, `Control.ts`, `src/app/App.ts`):
  - breakaway: a hand more than `CONFIG.interaction.breakaway` (0.25 m) from the control it holds lets go, with a firm buzz;
  - while a hand holds a control, the sticks don't walk or snap-turn you and the free hand doesn't pull you along;
  - the VHF handset (carried freely, `carried`) is exempt.
  Test in `tests/controls.test.ts`: a hand jerked 0.6 m away lets go, the lever left where it was.
- **W/S and the neutral stop** (`src/app/App.ts`, `src/controls/Tiller.ts`):
  - W/S no longer move the throttle while they steer a clicked joystick (searchlight, pod helm);
  - holding the key stops at neutral and stays there until it's let go and pressed again (helm keys, gamepad bumpers, the skiff tiller's W/S; the tiller also stops when the gear would flip).
  Test in `tests/tiller.test.ts`. Headless at the helm: W to 0.9, S held 6 s stays at 0, S again goes astern.
- **A design that won't build killed the game page** (`src/boats/library.ts`, shared): `boatType` catches a build failure and returns null, as for an unreadable code, so the default boat is used with a notice. A career whose saved refit won't build forgets it (`forgetCareerDesign`, `src/app/careerSession.ts`) and loads. The notice names the right fallback boat (pilot boat in Voyage). Test `tests/designWontBuild.test.ts`. The builder's own fault (`src/shipyard/parts/recipe.ts:409`) is the Shipyard chat's to mend; it has been told the owner approved it.
- **SOS did nothing on the Voyage maps** (`src/rescue/sos.ts`): with no boatyard, the salvage tug brings her into the nearest harbour's cargo berth (`sosHaven`), named by the coastguard. In Voyage she's made fast there, with the settle time. Test in `tests/voyageGo.test.ts`.
- **The Clyde froze ~25 s at the start laying out its 837 cargo items** (`src/cargo/cargo.ts`): the waiting counts are taken once and kept up while filling (`waitingCounts`), and the free-place search looks only at items near the port (`groundNear`). Measured in Node: the Clyde 22.0 s → 1.3 s, Tayvallich 38 → 32 ms, the layout identical item for item. A retry cap guards against a hung start.
- **Live weather froze the weather** (`src/environment/weather.ts` setLiveWeather, App): it's now the starting point. The director plans the next change from it by the map's odds (`profile`), the real sea holds until that first change, then follows the wind; the forecast's "becoming…" comes true. `tests/liveWeatherApplied.test.ts` updated.
- **Shared changes:** `src/core/launch.ts`, `src/core/simulation.ts`, `src/boats/library.ts` (as above); `tests/shipyard/build.test.ts`: a 120 s limit on the searchlight/fire-monitor placement test (14 s here, past the 20 s default on GitHub's machine), as the map chat did for the outboards.
- Checked: typecheck; all tests (1,485; the one failure in the full run was that Shipyard test timing out while two browsers ran, and it passes alone, now with room); the headless checks above. Not checked in a headset: the message card, the breakaway, the stick lock.

### A full-game review (owner, 24 Oct 2026)

Owner: "Can you run a review of the full game?", with Voyage's basics (exploring, random things, dynamic weather, playing with friends) and the Shipyard-to-game link weighted most, and career kept light.

- The findings and the suggested priorities are in `docs/REVIEW_2026-10-24.md`: 115 confirmed of 119 (11 high, 48 medium, 47 low, 9 polish; nothing critical). Nothing has been changed yet: the owner chooses what to fix.
- How it was done:
  - nine area reviewers, then an adversarial verifier per area;
  - a reproduce check on every serious finding (all 11 reproduced);
  - three more reviewers on the gaps a completeness pass named.
  The reviewers read code and ran scratch simulations only (no browser).
- Findings for other areas are marked by owner: the Shipyard builder crash, the stability warning and the Voyage link are the Shipyard chat's; the far-hills re-merge and the coast meshes never released are the Map chat's. Both chats have been pointed to the document.

### W and S for the throttle at the helm (owner, 24 Oct 2026)

Owner: "when you're using mouse and keyboard, currently the cursor keys control your throttle and steering ... could you move the throttle ... maybe it's just W and S, because ... the steering, the idea is you use it with your steering wheel."

- At the helm (F by the wheel), **W / S** move the throttle/gear lever ahead / astern, at the same rate as the arrow keys (`src/app/App.ts` handleDebugDriving). Walking is already off at the helm, so W/S had nothing to do there; away from the helm they walk as before. Not while working the deck crane's remote, which uses W/S itself.
- The arrow keys still work too: ↑ / ↓ the lever, ← / → the wheel. A and D do nothing at the helm: you steer with the wheel itself (drag it).
- The help panel (H) and the README's controls table say so (`src/core/keybindings.ts`).
- Not run in a browser: a small change to which keys feed the lever; typecheck and the menu/controls tests.

### The gangway mark: step ashore and aboard by pointing (owner, 24 Oct 2026)

Owner: "it's a bit clunky to get from the ship onto the quay side. So usually we're just jumping, and if the ship's low, you kind of fall underneath it. Would it be possible to have something where you look at the quay side from the boat, as long as it's docked, that you can click maybe by somewhere high on the dock side, and then it just puts you ashore?"

- **The mark** (`src/player/gangway.ts`): an amber ring with a down arrow and its words, turned to face you.
  - **Aboard a moored boat:** "Step ashore", low over the quay's edge abreast of her.
  - **Ashore near a moored boat** (within 14 m): "Step aboard", over her deck by the rail on the quay side.
  - It's drawn over everything (as the menu panels are), so you see it from inside the wheelhouse, where the quay's top is above your eyes and the roof would hide it.
- **Using it:** point a free hand at it in VR and pull the trigger, or click it on desktop (the reticle says "Step ashore / click"). Ashore puts you on the quay a step back from the edge, by her berth. Aboard puts you where you'd board her. It reaches up to 25 m. It sends the same `board` intent as the B key and the left stick click, which still work.
  - It's checked before the roving fender's quay-pointing, which it can't be confused with: it hangs in the air, the fender aims at the quay itself.
- **Fix:** going ashore by any means now uses the berth of the boat you're on (`src/player/playerControl.ts`), not always your home boat's: stepping off a second boat moored elsewhere put you on your own boat's quay.
- `CONFIG.gangway`: `up` 1.6 m (Step aboard, over the quay), `ashoreUp` 0.8 m (Step ashore, over the quay), `edgeIn` 0.6 m (in from the quay's edge), `radius` 0.35 m (the ring, and the pointer's target), `reach` 25 m, `aboardRange` 14 m.
- Tests: `tests/gangway.test.ts` (aboard a second boat moored at another berth, ashore by hers).
- Checked headless on Oban:
  - "Step aboard" over the pilot boat seen from the quay, and "Step ashore" seen from inside her wheelhouse over the door header, both clear (screenshots);
  - a click on "Step ashore" put the player on the quay, and the mark turned to "Step aboard".
- Not checked: in VR.

### Tests: room for the long game simulations on GitHub's machine (24 Oct 2026)

/next/ showed "failed its tests or its build" after the Shipyard door went up (publishing run 584). Nothing in the game was wrong. `tests/weather.test.ts` "the director moves on only to presets allowed to follow" ran out of time: about 19 s here against the 20 s default, and GitHub's runner is about twice as slow.

- The same fix the map chat made for the engine and outboard tests (2bc11fb): describe-level timeouts, with a comment saying why.
  - `tests/weather.test.ts`: 120 s (the director test 19 s here, fog 17 s).
  - `tests/weatherCrew.test.ts`: 30 → 120 s (20 s here).
  - `tests/painter.test.ts`: 60 s (15 s here).
  - `tests/slipway.test.ts`: 60 s (14 s here).
- `vitest.config.ts` is unchanged. The slowest of the rest already have room: the 750 kW test 51 s of 120, the coast traffic 25 s of 60, multi-tow 22 s of 120.

### Voyage: boats arrive made fast (owner, 24 Oct 2026)

Owner: "in voyage mode ... the boats spawn in and they're not docked. So they quickly drift off if it's windy. It'd be good that they're docked when they spawn in."

- **What was loose:** a Voyage start, a reload and a crew-mate's launch already came in moored (checked headless on all four maps). Two ways in didn't:
  - **Go** to a harbour put her alongside "ready to make fast" with no lines on;
  - a boat added from the fleet list was put afloat beside yours.
  Both drifted off in a wind.
- **Now, in Voyage** (`src/core/launch.ts`, `src/core/spawnBoat.ts`, shared):
  - **Go:** at a free berth she's moored with her lines fast; with the harbour full, she lies to her anchor in its bay, set and holding.
  - **The fleet list:** the boat comes in at the harbour the same way, at a free berth her size or at anchor off it (`berthOrAnchor`, which a crew-mate's launch now uses too). Only with no room for either does she go beside yours as before.
- **The career is unchanged:** its Go is the Debug menu's, and its tests and the first voyage's steps expect her to lie free and be made fast by hand.
- Tests: `tests/voyageMadeFast.test.ts`:
  - Go to four harbours in a squall: made fast, and still within 4 m of her berth (60 m at anchor) after a minute;
  - a spawned boat made fast in Voyage, free beside you in the career.
- Checked headless on Oban: Go to Brandy Rock Pier, Oban and Creag Moraig Pier, each moored and still. A spawned landing craft came in moored at Creag Moraig Pier.
- **Shared changes:** `src/core/launch.ts` (`berthOrAnchor`, `anchorAt`; Go in Voyage made fast), `src/core/spawnBoat.ts` (in Voyage, made fast at the harbour).

### The Shipyard from the yard: refit her in the real Shipyard page (owner, 24 Oct 2026)

Owner: "is it possible to render the whole shipyard web page in the 3D environment ... assess the feasibility ... and come up with a plan" (`docs/SHIPYARD_IN_GAME.md`). Then, on the plan: go with option A. "For Voyage mode ... no concept of money ... just configure a new ship. In career mode ... the money you have in your career save should be respected ... show you how much money you've got, and how much it costs ... back to the boat returns you to the game ... no multiplayer needed."

The game's side (the Shipyard page's refit mode is the Shipyard chat's, asked for with the address contract below):
- **The door:**
  - Career: the boatyard boards (Calder Haven, Loch Tarsk) get a button, **Open the Shipyard: refit her** (`ui/yardBoard.ts`).
  - Voyage: a **Shipyard** sign stands beside the planning table on the start quay (`ui/shipyardDoor.ts`, `CONFIG.voyage.shipyardSign`: width 0.9 m, 0.9 m past the table's end, 1.5 m up, seen within 25 m, reached within 4 m). It goes with the table when the host's Go moves it.
  - It opens only alone or hosting with no crew aboard (no multiplayer for this: owner), in a boat with a Shipyard design; in the career, with her in the yard's port. Otherwise the button says why.
- **The trip** (`app/shipyardTrip.ts`): the game saves (the career; Voyage its place), leaves VR, and goes to `shipyard.html?refit=career|voyage&back=<the game>&money=<career only>#<her code>`. Today the Shipyard opens on her design; its refit bar and "Back to the boat" come with the Shipyard chat's part.
- **Back:** the Shipyard returns to `back` with `design=<new>&refitFrom=<old>`.
  - Career: pays the difference in the Shipyard's price (new less old; nothing back for a cheaper boat; worked out again here, not taken from the address), as "Refit at the yard".
  - The career keeps her design (`CareerState.design`, saved), and from then on Career starts in her. A refit the career can't afford goes back to the old design.
  - Voyage: no money.
- Tests: `tests/shipyardTrip.test.ts` (the address out and back, the price rule, the career's design saved); `tests/menu.test.ts` updated.
- Checked headless:
  - On Oban the sign opens beside the table, and through it the Shipyard opens on the pilot boat (£295,000).
  - Career with £900,000, back from a refit of the beginner boat to the pilot boat: charged £209,000, "Refit at the yard" in the ledger, and the next Career start was in her.
- **Save format:** the career save gains an optional `design`. The live game's parser ignores it, but if a career is played on the live game it saves without it, and she'd start in the beginner boat again on /next/. Nothing else changes.

### Voyage: no career, but damage and session money (owner, 23-24 Oct 2026)

Owner, first: "most of the boats, when they spawn in, still have the career task list board ... and many spawn in with a damaged hull ... untangle anything to do with career mode and the voyage mode." Then, setting it straight: "you do still have the ability to damage your hull or your engine ... a need to go to the shipyard to repair it ... it should never spawn in with damage. It should only be if you really crash ... You should be able to earn money ... just in the local session ... see how much you've made ... buy upgrades with it ... But there shouldn't be a duty board ... career doesn't exist in the voyage mode."

- **`WorldState.voyage`** (`src/core/world.ts`, shared): set by `createWorld(…, { voyage: true })`, which the app passes on the Voyage page. It goes to the crew in the snapshots.
- **Damage as in the career, but never at the start** (`src/core/simulation.ts`, shared): in Voyage a boat takes no hull damage for `CONFIG.wear.spawnGraceS` (10 s) from her first tick, or from being sent to a port with Go (`VesselState.settleUntil`, `src/vessel/vesselState.ts`, shared). After that, a real crash does damage, and the engine wears, as ever. The career is unchanged: it keeps her condition from its save.
- **This session's money** (`src/career/career.ts`): pay, bills and the timber sale go in and out as in the career, but nothing is saved (the Voyage account `swvr.voyage.money` is no longer read or written; the career's slots were never written in Voyage). No harbour office offers, so no contracts.
- **No duty board** (`src/app/App.ts`): every boat's duty board is hidden in Voyage.
- **Repairs and upgrades in Voyage: not yet.** A Boatyard tab in the menu was built and taken out again the same day (owner: yard work doesn't go in that menu). The owner's idea instead: the Shipyard itself, from a yard building in the world; see `docs/SHIPYARD_IN_GAME.md`. Until then, the money shows in its pop-ups as it comes and goes.
- Tests: `tests/voyageMoney.test.ts` (the flag; money earned; the settle time). `tests/metaverse.test.ts` as before (the sale pays).
- Checked headless on Oban: the flag set, the board hidden, damage 0 at the start with 10 s of settling, £500 to start.
- **Shared changes:** `src/core/world.ts` (the `voyage` field and option), `src/core/simulation.ts` (the settling time in Voyage), `src/vessel/vesselState.ts` (`settleUntil`).

### More cargo, and crane cargo (owner request via the map chat, then in person, 23 Oct 2026)

Owner: "significantly more cargo now that the boats are bigger" (a fixed bigger amount, by the owner's choice); then "some cargo ... can only be lifted on by the cargo crane, so larger, heavier cargo ... close enough to the side of it to pick up with the crane."

- **More:**
  - `CONFIG.cargo.perPort` 5 → 12, stacked in rows of `stackRow` 6 (0.9 m apart). Further rows go `stackRowGap` 1.1 m back, on the side with the higher ground (away from the water).
  - Cargo contracts ask for 4, 8 or 12 deliveries (were 2, 4, 6).
- **Crane cargo** (`CONFIG.cargo.crane`):
  - Three new kinds: Pallet of blocks 420 kg, Engine block 380 kg, Chain basket 450 kg, 3 to 4 deck slots each.
  - Too heavy to carry (`takeBlocker`: "too heavy to carry. Lift it with a deck crane"); the crane's hook takes them as any load within its lift.
  - Three wait at each port with a cargo berth, 1.1 m in from its quay edge (`edgeIn`), 2.4 m apart (`spacing`) from the berth's middle outward, on free quay. They go only to another port with a cargo berth.
  - Within reach with the workboat's crane on her far side: her beam plus the fender clearance, less the column's inset, plus 1.1 m is 5.35 m, inside the boom run out (5.4 m). The lift there is 800 × 3.4 / 5.35 ≈ 508 kg, over the heaviest (450). Move her along the quay for the next.
  - Delivered at the destination's cargo quay (`portAtPoint` counts the berth's quay too). Paid × `payFactor` 3.
  - Labels say "crane only: lift it with a deck crane".
- **Drawing:** the cargo view drew at most 48 of each shape in the whole world, taken in the world's order, so with a dozen at every port your own quay's could miss out. Now 128, and goods ashore only within `drawRange` (400 m) of you.
- Tests:
  - `tests/moreCargo.test.ts`: 12 + 3 at every port; the crane cargo within the crane's reach and lift; no hand lift; × 3 pay; Oban and Tayvallich stocked on dry land.
  - `tests/cargo.test.ts`: updated for the crane cargo.
- Checked in headless Chromium: Calder Haven's quay, two rows of six, and three pallets along the edge beside the berth (screenshot). Not checked: lifting one aboard by the crane in play, VR.

### The handheld VHF easier to find in VR (owner request, 23 Oct 2026)

Owner: "very hard to find where it is because you can't see it ... a slightly bigger grab spot and ... a little bit of haptics when your hand reaches it."

- `CONFIG.radio.grabRange`: 0.10 → 0.18 m.
- A free hand coming within that reach gets a short tick in its controller (`CONFIG.radio.nearPulse` [0.3, 18 ms]), once each time it arrives. A hand already holding something gets none, as it can't take the radio (`player/radioHandset.ts`).
- Test: `tests/radioHandsetReach.test.ts`: the tick at 15 cm (outside the old reach), not repeated while the hand stays, again after it leaves; the grab there; nothing for a busy hand.
- Not checked: in the headset.

### Short, steep seas in enclosed water, long ones in the open (owner: always, textbook strength, both maps, 23 Oct 2026)

`docs/FETCH_SEAS.md`, built.

- **The fetch map** (`src/world/fetch.ts`): land and water on a grid over the regions in play (`cellM` 150 m, at most `maxCells` 25 000), and each water cell's fetch to land in 16 bearings. A ray off the map runs on as open sea, to `fetchMaxM` (60 km).
  - The effective fetch for a wind is the rays within 45° of it, weighted by cos².
  - Worked out once at load from the ground: 33 ms for Oban, 80 ms for the archipelago (desktop, in the tests).
- **The wind sea** (`src/ocean/windSea.ts`): JONSWAP fetch-limited growth at each cell for the wind now, capped at the fully developed sea. A gale over 3 km gives 0.56 m at 2.5 s; over 100 km, 3.2 m at 7.9 s.
  - It's carried by three short trains (`trains`: 4.4, 3.1, 2.2 s, down the wind), shared by a narrow spread in log-period about its peak period.
  - Less the part the open sea carries there: × √(1 − e²) for the wind's own exposure.
  - The long waves are scaled by each spot's exposure toward where they come from, e = F / `openFetchM` (40 km), at most 1.
  - The field is worked out again when the wind changes by `refreshWindPct` (4 %) or `refreshDirDeg` (4°). The physics reads it bilinearly (`windSeaAt`) and the shader as a texture of the same numbers, so they agree.
- **The waves** (`ocean/waves.ts`, `gerstner.glsl`, `environmentState.seaStateWaves`): the short trains replace the race chop's two waves.
  - Each is as tall as it is anywhere; at each spot it's scaled to the wind sea there plus, against a running race, the chop, at most its height.
  - The crest-loop cap counts them. A storm's Σ Q·k·A stays under the cap at every water cell on Oban (tested).
  - `rebuildWaves` keeps the phase at the players as a train swings with the wind.
  - `MAX_WAVES` goes 8 → 11. The race chop (the 9th and 10th wave) had never been drawn: the shader stopped at 8.
  - `significantWaveHeight` is the open sea's (the short trains left out).
- **Whitecaps** by the sea at each spot (`ocean.frag`): the open sea's crests × the exposure, and the short sea's own, which whitens sooner for its height.
- **The forecast** (`environment/forecast.ts seaWords`): from force 5, "A short, steep sea in the sounds and lochs; moderate in open water"; from force 7, breaking, and rough outside.
- **Debug → World → Sea:** Short seas: By fetch / Off (as before) (env intent `shortSeas`, `EnvironmentState.shortSeasOff`), and "Here: short sea 0.25 m at 2.5 s · long waves × 0.02 · fetch upwind 0.6 km".
- **Crew pages** work out the field from the host's wind each frame (the waves come from the host).
- Config: `CONFIG.ocean.fetchSeas` (all above). `CONFIG.currents.overfalls.chop` keeps only its `amplitude`; its periods are the trains'.
- Tests:
  - `tests/fetchSeas.test.ts`: the JONSWAP figures; Oban in a SW gale: Ardantrive Bay's sea short, its long waves small, the open water's long; no looping crests in a storm; Debug off and on; the archipelago's open ocean exposed and a harbour not.
  - `tests/overfalls.test.ts`: the short trains.
- Checked in headless Chromium, Oban in a SW gale (20 m/s):
  - In Ardantrive Bay with short seas on, a small short chop, no swell (0.25 m at 2.5 s). Off, the open sea's long swell rolls into the bay, as before.
  - Out in the open water, the long heavy sea with whitecaps.
  - No shader errors.

  Not checked: VR, and the Quest's frame rate with 11 waves (3 more per ocean vertex, and one texture read).

**Shared changes:**
- `src/world/fetch.ts` (new).
- `src/config/map.ts`: `overfalls.chop` keeps only `amplitude`.

### No whirlpools at the Falls of Lora; a plan for short steep seas in enclosed water (owner, 23 Oct 2026)

- **The Falls of Lora** (Oban): no whirlpools (owner: "there's not a whirlpool at the Falls of Lora ... we just need the other effects and the fast tides"). Its race keeps its 6 kn tide, standing waves and overfalls, with no whirl points (no swirls drawn, no knocks on the helm).
  - The coast pipeline now gives a race whirls only where the region request says so: `currentZones[].whirls`, default 0. Before, every real-coast race got 3.
  - The built Oban package is changed to match (`knocks: 0`). Sruth Tarsk, hand-built, keeps its four.
  - Test: `tests/fallsOfLora.test.ts`.
- **Short steep seas everywhere enclosed water makes them:** `docs/FETCH_SEAS.md`, a plan.
  - The wind sea grows with each spot's fetch by the JONSWAP relations: short and steep in a sound or loch, long in open water.
  - It's carried by a few short wave trains everywhere (the race chop made general); the long waves become the swell, scaled by each spot's exposure.
  - A fetch map per map, from the coast pipeline.
  - Not started: the owner's questions at its end.

**Shared changes:**
- `tools/coast/src/common.ts`, `nav.ts`, `package.ts`: a race's `whirls`.
- `tools/coast/requests/oban.yaml`: `whirls: 0`.
- `src/world/regions/oban.coast.json`: `knocks: 0`.

### Debug: the tidal races pinned at the ebb, to see the overfalls (owner question, 23 Oct 2026)

The owner: "I remember working on a steeper wave model ... I don't remember seeing that. Is there a debug option?"

- The steeper waves are the overfalls (Oct 2026): the sea stands up where it runs against a race. In Sruth Tarsk (the Sounds) and at the Falls of Lora (Oban) that's on the **ebb**.
- The Debug menu's only pin was "Peak", which is the flood. The flood runs with the sea's waves there, so it eased the sea: the overfalls could never be seen from the menu.
- Debug → World → Tidal races is now **By the clock / Flood / Ebb / Slack** (`RaceOverride` 'ebb', raceFactor -1; intent `raceOverride` value 3).
- Test: `tests/overfalls.test.ts`: the Ebb pin gives the ebb's full strength; the intent sets and clears it.
- Checked in headless Chromium: Sruth Tarsk in a Rough sea, pinned Flood and then Ebb. The two still pictures look alike at that size, as when the overfalls were built: the difference (1.6× steeper, crests 1.4× higher in the race against the ebb) is in the numbers. Not checked by eye from the wheelhouse or in VR. If it still reads too subtle there, `CONFIG.currents.overfalls` `heighten` / `steepen` / `chop` are the knobs.

### The front page: four equal tiles, each with a picture (owner request, 23 Oct 2026)

Owner: "The main page ... should have an equally sized tile for the shipyard and a suitable graphic for each of them."

- `index.html`: Career, Voyage, Shipyard and Training as four equal tiles, two by two (one column on a phone, each tile full width), every tile the height of the tallest.
- Each tile has its own drawing, original and in the game's chunky style, drawn as SVG in the page (no image files, nothing more to load):
  - Career: a workboat alongside a quay with crates and a crane;
  - Voyage: a chart of a coast with a route, its stops and a compass;
  - Shipyard: a boat's lines plan on a drawing board, with stations, waterlines and her length;
  - Training: a small harbour with a buoy slalom and a REC light.
- The Voyage maps are four compact buttons, two by two, with the full description on hover. Career and the Shipyard have a button at the foot of their tile.
- The Shipyard moved from the footer into its tile; the footer keeps the hull study's link.
- Checked: headless screenshots, wide and phone width: the four tiles equal on a wide screen (481 × 462 px each), no sideways scroll on a phone.

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

