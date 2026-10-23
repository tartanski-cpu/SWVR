# Progress: The modular builder

The running record for this area's chat: new modules (fitted parts) for the Shipyard to place. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/modules/`, `src/modular/`, `src/mechanisms/`; settings in `src/config/modules.ts`.
- **Its tests while working:** `npm run test:modules`. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/modules/ (branch `preview/modules`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes


### The deck crane drawn smoothly between ticks (done, awaiting owner test)

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
