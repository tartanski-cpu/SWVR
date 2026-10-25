# Progress: The modular builder

The running record for this area's chat: new modules (fitted parts) for the Shipyard to place. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/modules/`, `src/modular/`, `src/mechanisms/`; settings in `src/config/modules.ts`.
- **Its tests while working:** `npm run test:modules`. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/modules/ (branch `preview/modules`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Backlog: ideas to build later

The owner, 24 Oct 2026, from this chat's research into what real workboats carry: "make a kind of backlog with those ideas, which I can execute later". Not started; nothing to design ahead until the owner picks one. Each says what it is, what you'd do in the game, what it reuses, and anything it would need the owner's OK for (CLAUDE.md: no new physics bodies, ropes or particle systems without it). Our own designs throughout, not copies of the real products named.

1. **Crew transfer to wind farms (bow push-on).**
   - *Real:* wind-farm crew boats press a rubber bow fender against the turbine's boat landing (a ladder between two vertical tubes) and hold her there with thrust while technicians step across.
   - *In the game:* a small wind farm (or one turbine) off an island; a transfer job: bring her in, hold the bow against the landing with the throttle, and a crew-mate (or the passenger) steps across; too hard and the fender squeals, sliding off and the transfer waits. Later, the same skill at a passing ferry's pilot ladder.
   - *Builds on:* the push fender and push knees, walking ashore and stepping aboard, the ferries, the duty board for the job.
   - *New:* a bow fender module for the Shipyard (a cushion on the stem), the turbine and its landing (one model, a few draw calls), the transfer job. No new physics bodies.
2. **Better casualty recovery.**
   - *Real:* rescue craft lift a casualty out of the water lying flat (a hinged frame or net over the side, rolled up by a line), because lifting them upright can make them collapse; then a stretcher.
   - *In the game:* a recovery frame on the side, lowered into the water; float the survivor into it and roll them aboard lying down. Then a stretcher, carried by two players (one at each end) or dragged by one, to a berth in the cabin.
   - *Builds on:* the rescue system (survivors, the life ring, the boat hook, climbing over the stern), the berths and bunks, carrying cargo by hand.
   - *New:* a recovery-frame module (deck fitting at the rail) and a stretcher (a carried item). No new physics bodies.
3. **Navigation buoy maintenance.**
   - *Real:* buoy tenders lift a buoy aboard with the crane or an A-frame; its mooring chain is held on a chain stopper on deck while the buoy is cleaned, its lamp serviced, or it's swapped.
   - *In the game:* a job to service a buoy whose light is out: come alongside, hook it with the deck crane, land it on deck, drop the chain into the stopper, fix the lamp (a part from a locker), and put it back where it was.
   - *Builds on:* the deck crane and its hook, the A-frame, the chart (the buoys' places), the duty board.
   - *New:* the buoys in the world (some may already be drawn as marks), a chain-stopper deck module, the job. The chain could be drawn as a hanging curve, not a simulated chain.
4. **Later: landing craft equipment and vehicle deck cargo.**
   - *Real:* island landing craft carry vans, tractors, quads, livestock, water and fuel bowsers.
   - *In the game:* vehicles as deck cargo, driven or winched up the ramp and lashed down; maybe drivable ashore at the far end. Perhaps a livestock pen.
   - *Builds on:* the landing craft and her ramp, deck cargo and lashing, the islands' ports.
   - *New:* vehicle models as cargo; a vehicle you drive would be a new physics body (the owner's OK needed).

Not taken up from the research (24 Oct 2026): radar, side-scan sonar search, liferaft and float-free beacon, line-throwing gun, salvage pump, fishing gear (jigging, longline, sorting table), diving gear, signals, oil-spill boom, science davit and ROV, galley and bunk extras.

## Waiting for your test round

The owner, 23 Oct 2026: "I don't have time to test ... push it out to next, but make sure to keep a track of all these things that I've not tested, and I'll do a big round of testing." Everything below is on `next` (https://tartanski-cpu.github.io/SWVR/next/) and has passed the automatic tests and headless screenshots, but you haven't tried it yet. Tick each one off (or tell this chat what's wrong) as you go; this chat keeps the list up to date. Newest first. Each one's full write-up is in this log or in `PROGRESS.md` (named in brackets).

- [ ] **The autopilot on the console: AUTO, PORT 5°, STBD 5°** (this log). In the pilot boat (or any fleet boat but the beginner boat): steam out, press **AUTO** on the console (starboard of the wheel), then tap **STBD 5°** a few times: she should come round 5° a tap and hold the new heading. Is it in a good place on the console (the throttle lever stands in front of PORT 5° from the helm)? The wall panel now has only AUTO START and DOCK.
- [ ] **A TV on the wall, showing a browser tab** (this log). Shipyard, Furniture: **TV on the wall**, put it on a wall (over a settee). Game, on a desktop: click the TV, pick a tab playing a video (tick "share tab audio"): it shows on the TV, sound from the TV. Click again to stop; also try the browser's **Stop sharing** bar. With a crew-mate (best: one in the Quest): they see and hear it. Is the TV's height right, and does it look odd hung in front of the windows?
- [ ] **Rows of seats, turnable; technicians sit in them.** Shipyard, Furniture: on the catamaran with a saloon, add six or more seats in rows across the cabin; **Turn** some to face aft. Game: take a crew-transfer job; the technicians sit in those seats, facing the way they face.
- [ ] **Crew transfer, stop 2: the job** (this log). In the catamaran in the career: **Tests → Wind farm → Call job** (or wait for the VHF call). Make fast in Calder Haven: the three technicians come aboard into her cabin. Steam to their turbine (ringed T2 on the chartplotter, numbered on the paper chart), nose onto its landing and hold her with a little throttle: three seconds, then they step across one by one and climb to the platform; then it pays. Try the wrong turbine, and backing off half way. Step across yourself with the **Step across** mark, walk round the platform, and **Step aboard** back. Is three seconds' hold right? Are they paid enough?
- [ ] **Crew transfer, stop 1: the bow fender and the Holm Rig wind farm** (this log). Shipyard: the catamaran shows her bow fender (Deck gear step, Bow view); any other type but the tug can add one (Hull step, Hull protection). In the game, in the catamaran: steam out of Calder Haven, round Calder Holm to the south-east, to the three turbines. Look at one close up (the landing's tubes and ladder). Nose her slowly onto the landing's two tubes, then hold her there with a little throttle ahead: she should stay put, not slide off sideways, with no damage. Try it in a small sea too. At night, the red lights on the nacelles flash together and a yellow one burns on each platform.
- [ ] **The deckhouse's steep transverse stair** (this log). On the trawler with the deckhouse run aft (as in the next item): walk out of the aft door onto its top, to the landing at the middle of its aft edge, and walk down the stair to starboard and back up (it's walked as a smooth slope now, on desktop and in VR). Does it feel right, steep but easy to walk? Is the handrail where you'd reach for it?
- [ ] **Stern trawler: deckhouse run on aft, up to 2.5 m; less sheer; raised foredeck to 15 m** (this log). Shipyard → Stern trawler → Wheelhouse step, Deckhouse: Forward 1 m, Height 2.5 m, **Aft** 2 m. Check the rail and the stair on its aft face, and that the gear sits aft of it (Deck gear step). Hull step: Raised foredeck back to 10–15 m. In the game: out of the aft door onto the deckhouse top (the stair down is the item above). Is 2.5 m high enough to see over the gear?
- [ ] **The smoother on the A-frame and the other moving gear** (this log). On the stern trawler: shoot and haul the trawl and watch the A-frame swing, the net drum and the trawl winches turn; swing the searchlight. On the pilot boat: the pod drives' swing as you steer, the fire monitor. All should glide, no stepping, especially in VR.
- [ ] **A 750 kW diesel, the stern trawler's** (PROGRESS.md). Start her, run her up; the engine's sound and the speed (about 10 knots).
- [ ] **The fast rescue boat, a 6 m RIB** (PROGRESS.md; Shipyard only). Shipyard: a big boat, Deck gear → Skiff → the rescue boat. In the game: launch her on the crane, drive her from the centre console (about 28 knots), recover her.
- [ ] **The skiff as a rubber dinghy, 10 % smaller** (PROGRESS.md). On the workboat and the smaller Shipyard boats: launch and recover her on the crane, drive her, carry three crates, tie her up at the quay (she should sit level).
- [ ] **Step 3 toward a trawler: the stern trawler hull type** (PROGRESS.md). Shipyard: pick her, try the Length slider, take her into the game; handling, harbours.
- [ ] **Step 2: the net drum and the trawl winches** (PROGRESS.md). Shoot and haul the trawl: the net winds off and onto the drum, the warps off the winches.
- [ ] **Trawling: the catch comes aboard in the net, the A-frame swings it in** (PROGRESS.md). Haul, lift the codend over the stern, release the catch, box it.
- [ ] **Step 1: the fish hold and crew accommodation** (PROGRESS.md). Boxes go down into the hold; lift one out with the yellow button; the bunks, mess table, shower and head.

(`PROGRESS.md` also has older entries marked "awaiting owner test" from before the areas were split; the main game chat looks after those.)

## Changes

### The autopilot moved to the console, with PORT 5° and STBD 5° (done; on next, in your test round)

You asked for the autopilot to come off the helm assist panel on the wall and become a control on the main console, still switched on and off by one button, with two more buttons that alter course 5 degrees left and right.

- **On the console:** an amber **AUTOPILOT** group of three push buttons, starboard of the wheel (nearest it of the starboard groups): **PORT 5°**, **AUTO** (lit while it's on) and **STBD 5°**. AUTO works as before: it holds the heading she's on, turning the wheel itself, and lets go when you press it again, turn the wheel yourself, or lose the INSTR breaker. While it's on, each tap of PORT 5° or STBD 5° moves the heading it holds 5° that way (`CONFIG.modules.helmAssist.autopilot.stepDeg`), round through north; she comes round with the same steering as before. With it off, they do nothing.
- **The wall panel** keeps AUTO START and DOCK, and is narrower (`CONFIG.modules.helmAssist.width` 0.22 m).
- **In the Shipyard** it comes with the same choice as before (Controls step, Helm assist: Assist), so every boat that had the autopilot keeps it, the fleet's included. The console layout editor shows the new group, and it can be dragged like the others; on a console too short for its switches it goes up onto the dash face after DECK (`faceSwitchOrder`).
- **A fix on the way:** on a crowded console the rules close the switches up tighter than the hand-placement grid, and the grid positions they reported could overlap, so the console layout editor's "pin where it stands" moved some groups. They're now nudged apart along the row when it has room (`shipyard/parts/recipe.ts`).
- **Worth knowing:** on the fleet's boats the throttle lever stands in front of PORT 5° as you look from the helm (the button is on the panel just forward of the lever's base). If it's awkward in VR, drag the group in the console layout, or say and I'll change the rule.
- The bus keys are `autopilot.engage` (AUTO), and the new `autopilot.port` and `autopilot.starboard`.

Tests: `tests/helmAssist.test.ts` (the group of three, bound and lit, not on the panel; 5° a press, she follows, round through north, nothing when off). Checked in the headless Shipyard: the group on the pilot boat's console, and in the console layout editor.

**Shared changes:** `src/vessel/autopilot.ts` (`nudgeAutopilot`), `src/modular/busKeys.ts` (the two keys); in the Shipyard: `design.ts` (`PANEL_SLOTS.AUTOPILOT`: `panelAutopilot`, a console field, not in the code), `parts/recipe.ts` (the buttons and their group; the panel grid's starts nudged apart), `page.ts` (the Assist tile's words), `config/shipyard.ts` (`faceSwitchOrder`).

### A TV on the wall that shows a browser tab (done; on next, in your test round)

You asked for a TV, put on any wall in the Furniture step, that shows another browser tab: only desktop players can start it, but everyone sees it.

- **The Shipyard:** **TV on the wall** in the Furniture step, up to two. It goes against the wall nearest its pin (port, starboard or the saloon's aft wall), its screen's middle at seated eye height (`CONFIG.modules.furniture.tv.centre`, 1.35 m), lower under a low ceiling (it keeps `CONFIG.shipyard.furniture.tvCeiling` below it; its foot no lower than `tvLowest`, else it's left off). It hangs over the low furniture (a settee, a berth, the chart table), but never over a doorway, the exhaust stack, a piece that goes to the ceiling (head, shower, locker, bunks) or the other TV. Nothing to walk round: it has no footprint. A 32-inch screen, 8 kg.
- **In the game:** click the TV on a desktop: the browser's own picker opens (the game's own tab is left out of it); pick a tab. Its picture shows on the TV, kept to its shape (dark bars where it doesn't fill), and its sound (if "share tab audio" is ticked) comes from the TV in 3D, on the **FM radio & TV** volume slider. Click again, or the browser's **Stop sharing** bar, to stop. In VR a press says to start it from a desktop: the Quest's browser can't pick a tab.
- **For everyone:** the world only records who is showing a tab on which TV (`world.tv`, an intent `tvCast`), so every crew-mate knows. The picture itself goes from the player showing it straight to each crew-mate, as a video call over the same peer-to-peer link voice chat uses, with no server in between. A crew-mate who clicks the TV takes it over with their own tab. When the player showing it leaves, it goes dark.
- **Cost:** one draw call per TV (its screen; the case and bracket are merged with her other fixed parts). The picture is capped at 1280 x 720 and 30 frames a second (`CONFIG.tv.capture`), drawn only within `CONFIG.tv.showWithin` (40 m) and only while in view (a texture off screen isn't uploaded to the GPU), which matters on the Quest. The player showing it uploads one copy per crew-mate.
- **Worth knowing:** paid streaming services (Netflix and the like) usually show black: the browser protects their video. And on a wheelhouse wall the TV hangs in front of the windows; real boats hang them on a bulkhead or under the deckhead. Say if you'd rather it came down from the ceiling.

Config: `CONFIG.tv` (`capture`, `showWithin`, `sound`, `confirmS`, `retryS`), `CONFIG.modules.furniture.tv` and its colours `tvCase` / `tvOff`, `CONFIG.shipyard.furniture.tvCeiling` / `tvLowest`. Files: `src/modules/furniture/tvScreen.ts` (the screen, a press), `tvCast.ts` (the picture between players), `tvState.ts` (who's showing what), the `tv` kind in `src/modules/furniture/index.ts`. Tests: `tests/tv.test.ts`.

Checked in the headless browser: a second tab with moving colour bars, picked automatically, shows on the catamaran's TV over the settee; and in a two-browser game through the real PeerJS broker, the crew-mate's TV shows the host's tab. Not checked: the sound (the test browser has none), and stopping it (stopping a captured tab crashes the headless test browser itself, even on a blank page without the game, so that needs your desktop).

**Shared changes:** `src/core/world.ts` (`world.tv`) and `src/core/simulation.ts` (its intent and tick), `src/app/App.ts` (the TV's press and its frame update), `src/net/voice.ts` (leaves the TV's calls alone), `src/audio/mixer.ts` (the slider is "FM radio & TV"); in the Shipyard: `design.ts` (`tvAt`, `tvAt2`), `furnishing.ts`, `gearMenu.ts`, `placing.ts`, `page.ts`, `parts/furniture.ts` (the TV's place; and "moved along the wall to fit" now counts only moving along the wall, not being put back against it).

### Rows of seats that turn, for the crew-transfer catamaran (done; on next, in your test round)

You asked to seat the technicians in the Furniture step's seats, set out in rows across the wheelhouse "like a bus", and turnable. The seats could already stand free anywhere on the floor (in a narrow wheelhouse the helm and doorway clearances push them aside, as you said, which is right); what held a bus back was the limit of four.

- **Twelve seats** (the other pieces stay at four; one head). Seats 5 to 12 are new design fields, like the first four not in the 10-character code (a boat with furniture travels as a link or file).
- **Turn:** each seat has a facing, 0 to 7 in 45 degree steps clockwise seen from above (forward, forward-starboard, starboard, ... ). Its row in the Shipyard has a **Turn** button beside Move and Take off, and its label says which way it faces. A turned seat's footprint is turned too when it's fitted (a 45 degree seat takes a slightly bigger square), so seats in rows still don't overlap. Taking a seat off moves the ones after it up a number, each keeping its facing.
- **The technicians sit in them:** boarding at Calder Haven, each takes the next free furniture seat (in the order you placed them), sitting on its cushion and facing as it does. With no furniture seats (or more technicians than seats) they take the deck seats as before.

Files: `src/shipyard/design.ts` (seat fields to 12, `SEAT_FACES`, `seatYawDeg`), `src/shipyard/furnishing.ts` (`turnSeat`, facings follow the seats when one is taken off), `src/shipyard/parts/furniture.ts` (turned footprint, the yaw, the label), `src/shipyard/page.ts` (Turn button), `src/transfer/transfer.ts` and `transferView.ts` (the seats and their facing). Tests: `tests/shipyard/seatRows.test.ts`. No new config keys.

**Shared changes:** the Shipyard's files above (noted in `docs/progress/shipyard.md`).

### Crew transfer to wind farms, stop 2: technicians, the job, stepping across, the chart (done; on next, in your test round)

Owner, 24 Oct 2026: "go ahead with stop 2".

- **The job** (new `src/transfer/transfer.ts`, state `WorldState.transfer`, stepped by the host with the others):
  - now and then (first after 4 minutes, then every 7 to 13 minutes once the last is done) the farm radios for a crew boat: 2 or 3 technicians for one of the turbines, waiting on the quay at Calder Haven;
  - a boat made fast in Calder Haven takes them aboard, one every 1.5 s, each to a seat (her rescue seats: on the catamaran, in her cabin);
  - **on the landing:** her bow (her fender's face, else her stem) within 0.9 m of a landing's face, moving under 0.4 m/s, pushing at least 2.5 kN (`landedOn`). Held there 3 s on their turbine, the first steps across; each of the others 2.5 s later. Come off it and the count starts again. On the wrong turbine they say so on the radio;
  - each takes 1.5 s to step over and climbs at 0.6 m/s to the platform, where they stand, working, until the next job;
  - all up: paid (£500 and £120 a technician, credited to Calder Haven, reputation +4; career `pay.transfer`, `pay.transferPerPerson`, `rep.transfer`) and a thank-you on the radio;
  - settings `CONFIG.transfer`; jobs come by themselves in the career game, not on the Voyage maps or in tests.
- **The technicians drawn** (`src/transfer/transferView.ts`): hi-vis orange overalls with reflective bands, navy trousers, a white hard hat, each their own face (as the avatars); standing on the quay, sitting aboard (in the boat's frame), stepping across, on the ladder, on the platform. One mesh each, only while there's a job.
- **Players step across** (owner: "and players too"):
  - while a boat is held on a landing, the gangway mark shows **Step across** over the tubes (`player/gangway.ts`); it puts you on the turbine's platform at the ladder's head (`board` intent with a `turbine:` ref, `player/playerControl.ts`);
  - the platform is walked as ground, round the tower, not off its edge or into the tower (`world/windFarm.ts` `platformFloor`, `inTower`; `world/landWalkArea.ts`);
  - on the platform, while she's still held there, **Step aboard** over her bow takes you back.
- **On the chart:** the paper chart prints each turbine's sign and number and the farm's name; the chartplotter shows each turbine as a white three-bladed sign, the job's ringed in amber with its number (T1 to T3).
- **Debug** (Tests tab, **Wind farm**): **Call job** calls one now (for turbine 2); **To its landing** puts your boat 40 m off its turbine's landing, stopped, heading onto it.
- **Shared changes** (all small; noted in game.md):
  - `src/core/world.ts`, `src/core/simulation.ts` (the state, its step and its intents);
  - `src/career/career.ts` (job kind `transfer`), `src/config.ts` (its pay and reputation);
  - `src/player/gangway.ts`, `src/player/playerControl.ts` (stepping across), `src/world/landWalkArea.ts` (the platform);
  - `src/nav/chartPlotter.ts`, `src/nav/paperChart.ts` (the turbines);
  - `src/ui/mainMenu.ts`, `src/app/App.ts` (the view, the debug buttons), `tests/menu.test.ts`.
- **Checked:**
  - typecheck, all of `npm test`, the build;
  - `tests/transfer.test.ts`:
    - a job: on the quay, boarding one at a time to their own seats, only when made fast at Calder Haven;
    - the wrong turbine called out;
    - on the right landing: the first across after 3 s, the next 2.5 s later, all up the ladder, paid, the ledger line;
    - backing off before the count: nobody across;
    - a player across onto the platform (walkable, not off its edge, not inside the tower) and back aboard;
  - in the game (headless, the catamaran): the job called on the VHF, the three on the quay, aboard, held on turbine 2's landing (the Step across mark showing over the tubes), across, two on the platform and one on the ladder.
- **Not checked:**
  - VR, and driving it in by hand (the headless game was stepped by script);
  - the paper chart and the chartplotter's turbines were not looked at;
  - with a crew in multiplayer.
- **Not done** (for later, if wanted):
  - fetching the technicians back at the end of their shift;
  - a lit-up "held" light at the helm;
  - climbing the turbine's ladder yourself (you step straight onto the platform).

### Crew transfer to wind farms, stop 1: the bow fender and the Holm Rig wind farm (done; on next, in your test round)

Owner, 24 Oct 2026: "let's start with the crew transfer to wind farms" (the first of the deck-work backlog). Agreed: the farm in the career world; technicians, and players too, step across (stop 2); a bow fender as a Shipyard choice, standard on the catamaran; all built in this chat.

- **The bow fender** (new module `hull.bow-fender`, `modules/bowFender`; Shipyard design choice `bowFender`, Hull step, Hull protection, **Bow fender**):
  - a thick block of black rubber on her bow, its front upright, 0.4 m forward of her stem at the deck, from her bulwark top down 1.2 m;
  - on a pointed bow it sits round the top of her stem, its back following the stem's rake; on the catamaran it spans the front of her bridge deck between the hulls (1.8 m wide, a monohull's 0.9 m);
  - it grips as the tug's push knees do (it gives the same `pushFender` gear: `CONFIG.contacts.guards.pushFender`, friction 0.8), so she holds on the landing without sliding;
  - not on the tug (her push knees already do it); the catamaran comes with one;
  - weight about a quarter of a tonne on the catamaran (`kgPerM3` 250: a moulded fender round a hollow core), price £6,000 (`CONFIG.shipyard.bowFenderPrice`);
  - settings `CONFIG.modules.bowFender`; not in the short code (she travels as a link or file).
- **The Holm Rig wind farm** (career world, home region; `windFarms` in `src/world/regions/home.ts`):
  - three turbines in 40 m of open water south-east of Calder Holm, in a row running ESE, each with its boat landing facing NW toward Calder Haven;
  - placed clear of the Calder Bank fishing ground and the potting grounds (it was first drawn on Calder Bank; moved before pushing);
  - each turbine:
    - a dark monopile under a yellow transition piece, a grey platform 13 m up with a rail, and a white tower to a 72 m hub;
    - a nacelle turning to face the wind, and a 42 m-blade rotor turning with it (stopped in a gale);
    - red nacelle lights flashing together after dark, a yellow light on the platform;
  - the boat landing: two yellow tubes 1.1 m apart standing 1.4 m off the transition piece, from 3 m under the water to 5 m up, braced to it, a ladder between them and on up to the platform;
  - solid (`src/world/windFarm.ts`): a block for the foundation and one for the landing, its face where the tubes are; nowhere to tie up;
  - drawn in four draw calls for the whole farm (`src/world/view/windFarmView.ts`: the still parts merged, the nacelles and rotors instanced, the lights one set of points);
  - settings `CONFIG.windFarm` (in `src/config/modules.ts`).
- **Shared changes:**
  - `src/world/defs.ts` (`WindFarmDef`, `RegionDef.windFarms`);
  - `src/world/archipelago.ts` (`WIND_FARMS`; the turbines' blocks in `BLOCKS`);
  - `src/world/regions/home.ts` (the farm: the map chat's file);
  - `src/app/App.ts` (the view: three lines, the main game's file);
  - `tests/regions.test.ts` (it counts the blocks: two per turbine now);
  - the Shipyard's files (`design.ts`, `parts/trim.ts`, `hullDef.ts`, `recipe.ts`, `weights.ts`, `catalog.ts` (the catamaran's default), `page.ts`, `tiles.ts`, `src/config/shipyard.ts`).
- **Checked:**
  - typecheck, all of `npm test`, the build;
  - `tests/windFarm.test.ts`:
    - which boats have the fender; it's the first of her ahead, weighed and priced;
    - the turbines are deep, clear of the grounds, and solid with their landing face where the tubes are;
    - four draw calls for the whole farm;
    - in the simulation, the catamaran nosed onto a landing with a quarter throttle holds there, pushing about 18 kN on her fender, still to within a few centimetres for 20 s, her hull never touching, no damage;
  - in waves (the same push at a third throttle, 20 s, measured once, not kept as a test), much as real crew boats find it (their limit is about 1.5 m):
    - in 0.6 m significant wave height: held to within 7 cm;
    - in 1.2 m: she creeps about 0.5 m sideways along the landing;
    - in 1.8 m: about 1 m;
    - no damage in any;
  - screenshots:
    - the Shipyard: the fender on the catamaran and the pilot boat;
    - the game: the turbine from a boat's deck, its landing close up, and the farm from Calder Holm.
- **Not checked:**
  - VR;
  - the night lights' look.
- **Next (stop 2):**
  - technicians to carry: picked up at Calder Haven; they step across when she's held steady on the landing;
  - players stepping onto the landing and climbing to the platform;
  - the job in the career, and the farm on the chart.

### The deckhouse stair walked as a slope (done; on next, in your test round)

Owner, 24 Oct 2026: the transverse stair is "hard to walk up on desktop ... instead of doing steps on the collision physics, I would do a ramp".

- **Walked as one smooth slope** from the deck at its foot up to the landing, under the drawn plates (`vessel/layout.ts` `stairRamp`). It's still drawn as open steel steps. Walking it doesn't add any polygons; the slope is only in the walking maths.
- **Why it was hard:** the deck under the stair was still walkable. On a stair this steep your height follows the floor with a little smoothing, so it fell more than a step behind and you carried on along the deck *under* the stair. The deck under it is no longer walked, so the slope is the only floor there.
- **Checked:**
  - in the headless game with the desktop keys (W held): from the deck up to the deckhouse top in about 5 s, and back down in about 5 s, never under it;
  - `deckhouseAft.test.ts`: the slope rises steadily under every step, small moves up it are each well under a step, and the deck under it isn't walked;
  - typecheck, all of `npm test`, the build.
- **Shared changes:** `src/vessel/layout.ts` (the slope; the open deck kept off the stair's footprint).

### The deckhouse's ladder aft becomes a steep transverse stair (done; on next, in your test round)

Owner, 24 Oct 2026: "make the deckhouse ladder a steep transverse stair instead".

- **On a deckhouse run on aft of the wheelhouse** (`dhAft`), the vertical ladder down its aft face is now a **steep ship's stair across that face**:
  - a landing at the top, just to port of the centreline, where you step on and off the deckhouse top (the deckhouse's rail is open over it);
  - its treads run down to starboard against the face, each at most 0.3 m up and 0.22 m across (about 54°), 0.65 m out from the face;
  - each step (and the landing) is a thin steel plate, open underneath (owner, the same day: "just the steps themselves as if they were metal plates. And nothing underneath it"; it was first drawn as solid blocks down to the deck);
  - you **walk** up and down it like the raised foredeck's steps; nothing to climb with grip or Space;
  - a handrail along its open side from the foot up to the landing, and round the landing's aft edge and port end;
  - for 2.5 m of deckhouse: 8 treads and the landing, about 2.5 m across her.
- **Settings:** `CONFIG.shipyard.deckhouse.walk.stair` (`rise`, `tread`, `width`, `landing`, `kg` 90 for the stair and its rails).
- **Kept clear of it:** the life ring and a rod rack on the deckhouse's aft face move past its foot, or past its landing to port if there's no room. The aft-deck gear keeps aft of it.
- **Only this one.** The ladders up other walked deckhouse tops (beside the wheelhouse, or up the front) are as they were. Say if you want stairs there too.
- **Shared changes:**
  - `src/vessel/deckhouse.ts`: `DeckhouseWalk.stair` (its treads), and the ladder's face can be `'stair'`, which isn't climbed;
  - `src/vessel/view/hullMesh.ts`: draws the stair and its rail.
  - Shipyard: `parts/house.ts` (`transverseStair`), `parts/deckGear.ts`, `parts/weights.ts`, `src/config/shipyard.ts`.
- **Checked:**
  - typecheck, all of `npm test`, the build;
  - `deckhouseAft.test.ts` now checks the stair: each rise at most 0.3 m, it stays inside the deckhouse's width, the gear and fittings clear of it, and walking from the top down the landing and every tread to the deck;
  - headless Shipyard screenshot of the trawler (stair, landing, rails).
- **Not checked:** walking it in the game, in VR or on desktop.

### The stern trawler: a deckhouse run on aft of the wheelhouse, up to 2.5 m high; less sheer; a longer raised foredeck (done; on next, in your test round)

Owner, Oct 2026, from the Shipyard's view of the stern trawler: "the option to extend the deck house further aft of the wheelhouse ... there'll need to be some ladders or stairs to get you up there if it's high", "the deck house to be ... 2.5 meters high ... high enough to go over the bridge", and "slightly less shear by default and to allow the raised foredeck to come back significantly more". Done in this chat at the owner's word (Shipyard and hull-study files; see Shared changes).

- **The deckhouse can run on aft of the wheelhouse** (new design choice `dhAft`; Wheelhouse step, Deckhouse group, **Aft**: flush, or 0.5 m steps to 6 m):
  - its top is a deck behind the wheelhouse, the house's aft door opening onto it (any door steps stand on its top), always walked, railed right across its aft edge;
  - a vertical ladder down its aft face on the centreline to the working deck (the same ladder as the walked deckhouse top's: climb with grip / Space);
  - the deck gear keeps aft of it and its ladder: the A-frame, net drum, trawl winches, the deck crane, the skiff, poles, fenders, the tug's hook; the life ring and a rod rack on the aft wall go on its aft face;
  - it stops short of leaving less than 4 m of working deck forward of the transom (`CONFIG.shipyard.deckhouse.aftDeck`), and says so;
  - not with a deckhouse only as wide as the wheelhouse (that one is only forward of it), and the wheelhouse floor can't sink into it (its aft door opens onto the top): both said;
  - it's weighed and priced as the rest of the deckhouse (its plate, its rail);
  - travels as a link or file, not the short code.
- **The deckhouse up to 2.5 m high** (was 1.5 m; `MEASURES.dhHeight`). Over 1.5 m it travels as a link or file.
- **The stern trawler's sheer a little less:** her deck now rises about 1.15 m from aft to the stem at her standard size, not 1.5 m (the hull study's `sternTrawler` sheer: 2.1 m at the stem, 1.25 m at 70 % of her length). **Sheer** on the Hull step still adds more.
- **The raised foredeck comes back much further:** its slider now runs from 1 to 15 m aft of the bow (was 8 m; `SCALES.fcLength`, 30 steps). As before, it never ends under the wheelhouse (it runs on aft past it) and stops short of the transom with room for its ladders.
- **Shared changes** (small; for the other chats):
  - `src/vessel/deckhouse.ts`: `DeckhouseLayout.houseAft`, set when it runs on aft of the house;
  - `src/vessel/view/hullMesh.ts`: its rail then runs right across its aft edge;
  - `src/vessel/layout.ts`: a deckhouse's walked top is kept clear of a house's door steps (they stand on it now);
  - Shipyard files: `design.ts` (the `dhAft` field, the ranges), `parts/house.ts`, `parts/deckGear.ts`, `page.ts`, `src/config/shipyard.ts` (`deckhouse.aftDeck`); hull study: `src/hulls/designs.ts` (her sheer). Noted in `shipyard.md` and `hulls.md`.
- **Checked:**
  - typecheck, all of `npm test` (1443; three slow tests timed out while the screenshots ran alongside, and pass on their own), and the build;
  - new tests (`tests/shipyard/deckhouseAft.test.ts`): it builds without warnings 2 m aft and 2.5 m high; the trawl gear stands aft of its ladder; you walk out of the aft door onto its top and climb its ladder (2.5 m) to the deck; the limits and their warnings; the raised foredeck builds at 8, 11 and 15 m;
  - in the Shipyard (headless screenshots): the trawler with the deckhouse run 2 m aft and 2.5 m high (rail, ladder, gear aft of it), and with a 10.5 m raised foredeck running on past the house.
- **Not checked:** climbing it in VR or on desktop in the game (the walk test covers it); stairs instead of a ladder (not built: say if you want a stair, like the raised foredeck's steep ladders, rather than the vertical one).

### The smoother on the A-frame and the other moving gear (done; on next, in your test round)

Owner, Oct 2026, after the deck crane's: "use the smoother on the A-frame and other moving gear too".

- **What's now drawn smoothly between the simulation's ticks** (the deck crane's smoother, `mechanisms/tickSmoother.ts`, `CONFIG.modules.smoothing.tauTicks`):
  - the trawl **A-frame**'s swing on its rams;
  - the **net drum** turning and its roll of net;
  - the **trawl winches** turning and their warp;
  - the **searchlight**'s and the **fire monitor**'s pan and tilt;
  - the **outboards**' (and stern drives') swing as you steer;
  - the **pod drives**' swing.
- **Left as they were:** the tow winch's drum already turns smoothly, frame by frame. The skiff crane follows the skiff, whose own position is already smoothed. Switches, buttons and the fish hold's boxes don't glide anyway.
- **The smoother now settles exactly** once a part comes to rest, so gear standing still isn't redrawn every frame.
- **Cost:** the drawing runs about 30 ms behind the simulation, as the crane does. The trawl's net and codend (drawn by the main game's code) hang from the A-frame as the simulation has it, so at the A-frame's swing rate they can be up to about 1 cm apart while it moves: too small to see.
- **Checked:**
  - typecheck and all of `npm test`;
  - the smoother's test now also checks it settles exactly;
  - in the game (headless): the stern trawler (A-frame, drum, winches, searchlight) and the pilot boat (pod drives, searchlight, fire monitor) run with the engine started, the helm over, the searchlight swung and the trawl shot, with no errors.
  - Smoothness itself is for the Quest: headless Chrome draws too slowly to judge it.
- **Shared changes:** none.
- **Test steps:**
  - **VR:**
    1. The stern trawler: shoot and haul the trawl, and watch the A-frame swing in, the drum and the winches turn.
    2. Swing the searchlight and the fire monitor on their joysticks.
    3. Put the wheel hard over on a boat with outboards or pod drives and watch them swing (Engine step's view, or from her stern).
  - **Desktop:** the same, the joysticks with W A S D after clicking them.

### The stern trawler's exhaust as the tug's (approved by the owner; on next)

Owner, Oct 2026: "The big fishing trawler should have the same exhaust system as the tug, so coming out of the wheelhouse, and the side water pumping exhaust thing".

- **What she gets:** the tug's dry exhaust, the existing module `fitting.exhaust-stack`:
  - a stack per engine up through the wheelhouse's aft corner (starboard; a twin's second to port), well over the roof, raked aft or straight;
  - the smoke out of its top;
  - her cooling water spitting from a hole in her side near the waterline, abreast of the engine.
  - On the Engine step, the **Exhaust stacks** choice (raked / straight) now shows for her too.
- **How:** the stacks were switched on for the tug's hull type only. They now go with a hull-type flag, `exhaustStacks` (Shipyard catalogue), set on the small tug and the stern trawler. Nothing else changes: the stack's sizes are the tug's (`CONFIG.shipyard.exhaustStack`).
- **Checked:**
  - typecheck and all of `npm test`;
  - `tests/shipyard/sternTrawler.test.ts` now checks the stack and the water outlet;
  - she builds with them at every length, single or twin, raked or straight, with no new warnings;
  - in the game (headless): the stack through her wheelhouse roof with its smoke, and the outlet hole in her side.
- **Shared changes:** none outside the Shipyard. **In the Shipyard's files** (this chat's change, noted in its log too): `src/shipyard/parts/catalog.ts` (the flag, on the tug and the stern trawler), `parts/hullDef.ts` (the stacks go with the flag), `page.ts` (the Exhaust stacks choice shows for any hull type with them).
- **Test steps:**
  - **Desktop:** Shipyard → Stern trawler → Engine step: the Exhaust stacks choice. Then into the game: start her engine and look at the wheelhouse roof (the stack and its smoke) and her starboard side abreast of the engine room (the cooling water).
  - **VR:** the same, from her deck and from the quay or a boat alongside.

### The deck crane drawn smoothly between ticks (approved by the owner; on next)

Owner, Oct 2026, after testing the deck crane: "when you rotate it left and right ... it's kind of laggy ... I don't know if that's just the steps that you've created in the animation".

- **Why it stepped:** the simulation moves the crane 60 times a second, and the Quest draws 90 frames a second. The crane was drawn straight from the latest tick: it moved on two frames out of three and stood still on the third, a staircase felt as stutter and lag. The boats themselves are drawn between their last two ticks; module parts weren't.
- **The fix:** `src/mechanisms/tickSmoother.ts`, a small reusable smoother.
  - Each drawn value follows the newest tick through two smoothing stages. The time constant is the measured time between ticks times `CONFIG.modules.smoothing.tauTicks` (1.0).
  - The staircase becomes an even motion at the frame rate, starting and stopping gently.
  - A jump (a reset, a snapshot) is drawn at once.
  - It measures how often ticks arrive, so it also smooths a crew-mate's machine, where the host's snapshots come further apart.
- **On the deck crane** (`modules/deckCrane`): its slew, boom angle, telescope and wire are smoothed, and the hook where the motion compensation holds it. The simulation is unchanged: the crane does exactly what it did and is only drawn differently.
- **Measured** (60 Hz ticks, 90 Hz frames, slewing at full rate, 25°/s):
  - Before: each frame moved 0° or 0.42° (a whole tick).
  - Now: each frame moves 0.25–0.32° against an even 0.28°.
  - It's drawn about 28 ms behind the simulation (the boats are drawn about 17 ms behind).
  - With a crew-mate's 20-a-second snapshots: 0.25–0.30° a frame, 110 ms behind.
- **Tests:** `tests/modular/tickSmoother.test.ts`:
  - raw is a staircase, smoothed is even within 20%;
  - 20 Hz snapshots are glided over;
  - it stops where the crane stops;
  - a jump is drawn at once.
- **Checked:** typecheck; `npm run test:modules`; all of `npm test`. In the game (headless): the crane slews with no errors. Headless Chrome draws too slowly (a frame every 0.7 s) to judge smoothness: that's for the Quest.
- **Not done:** the joystick's response is unchanged, squared (half a push gives a quarter speed, for fine control), so a light push still moves it slowly. If it still feels slow rather than stepped, that's the next thing to look at. The A-frame and the other moving gear can use the same smoother.
- **Shared changes:** none.
- **Test steps:**
  - **VR:**
    1. A boat with the deck crane: the Shipyard's Deck gear, or the debug menu's lander, pilot boat or small tug with a deck crane fitted.
    2. Engine on, DECK HYD on.
    3. At the crane's post, push the left stick fully left and right: the slew should be smooth. Then raise and lower the boom, and hoist.
  - **Desktop:** click the left stick, then A / D to slew, W / S for the boom.
