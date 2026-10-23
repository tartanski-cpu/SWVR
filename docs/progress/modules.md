# Progress: The modular builder

The running record for this area's chat: new modules (fitted parts) for the Shipyard to place. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/modules/`, `src/modular/`, `src/mechanisms/`; settings in `src/config/modules.ts`.
- **Its tests while working:** `npm run test:modules`. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/modules/ (branch `preview/modules`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

### The smoother on the A-frame and the other moving gear (done, awaiting owner test)

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
