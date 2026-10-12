# SWVR

A browser-based VR sea rescue and operations game: chunky flat-shaded boats that you operate from the inside, with physical levers, wheels, switches and live instruments. It's built with TypeScript, Vite, Three.js and WebXR, and targets the Meta Quest 3 and desktop browsers.

**Status:** MVP in progress. See [`PROGRESS.md`](PROGRESS.md).

## Play it (no install)

Open this URL in the Quest 3 browser (or any desktop browser) and press **Enter VR**:

**https://tartanski-cpu.github.io/SWVR/**

The site redeploys automatically on every push to the development branch, about 1–2 minutes after the push. Check progress under the repo's **Actions** tab.

### One-time GitHub Pages setup (repo owner)

1. On GitHub, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. Re-run the latest **Deploy to GitHub Pages** workflow from the **Actions** tab. Pushes after that deploy on their own.
3. If the deploy job says the branch is "not allowed to deploy to github-pages", go to **Settings → Environments → github-pages → Deployment branches** and add `claude/admiring-dirac-v9wwih`. You can also make that branch the default.

## Controls

### Desktop (development)

Keys are bound by **physical position**, so they work the same on QWERTZ (German), QWERTY and other layouts. The on-screen help shows each key as printed on *your* keyboard; this works in Chrome and Edge, while Firefox shows US names. All bindings are in `src/core/keybindings.ts`.

| Key | Action |
|---|---|
| Click the view | Capture the mouse for looking (Esc releases it) |
| W A S D | Walk (with collision; Shift = brisk) |
| F | Toggle walk / free-fly camera (Space / C = up / down when flying) |
| Space / C at the ladder | Climb up / down (walk forward off the top onto the roof) |
| B | Board the boat (you appear at the helm) / back to the platform |
| Aim **+** and click / drag | Operate the bridge controls (see below) |
| E | Debug: engine start / stop |
| ↑ / ↓ | Debug: throttle/gear lever ahead / astern |
| ← / → | Debug: wheel to port / starboard |
| X / G | Debug: lever to neutral / wheel amidships |
| T | Hydrostatics + sea trials report |
| L | Sea state: flat calm / moderate |
| 9 / 0 | Motion coupling −/+ 10 % |
| R / K | Test: drop the boat from 4 m / heel her 20° and release |
| V | Buoyancy debug view on/off |
| N / M | Time of day −/+ 30 min |
| F3 or I | Debug overlay on/off |
| P | Wave surface probes on/off |
| F1 or H | Help panel on/off |

### VR (Quest 3)

| Input | Action |
|---|---|
| **Grip** with your hand on the throttle lever or wheel | Grab it; it follows your hand (not where the controller points). Two hands work on the wheel |
| **Trigger** touching a button or switch | Press it (start/stop, horn, nav lights) |
| Trigger pointing at a button or switch a little out of reach | Pointer-ray fallback for buttons and switches only (a blue line shows the target) |
| **Grip** on empty air + pull | Move (grab the world). Two grips + twist: turn |
| **Grip + pull down at the ladder** | Climb (aft face of the wheelhouse, up to the railed roof). Push up to climb down |
| Left stick | Walk (head-relative, optional) |
| Right stick ← / → | Snap turn 30° |
| Left stick click | Board the boat (at the helm) / back to the platform |
| Hold X + left stick ↑ / ↓ | Motion coupling 0–100 % (comfort; default 100 % = rigid to the deck; lower values make controls harder to grab) |
| B or Y | Debug panel (on your left wrist) |

### Bridge (milestone 6)

At the helm, from left to right on the console:

- **Nav lights** toggle switch.
- **Horn** button (hold).
- **Wheel**: 1.5 turns lock to lock. Hydraulic steering, so it stays where you leave it.
- **Throttle/gear lever**: forward = ahead, back = astern, with a notch at neutral.
- **Start/stop** button. The engine only starts with the lever in neutral.

The dash shows **speed** (kn), **heading** (compass tape), **engine RPM** (with gear, engine state and load) and **rudder angle** (needle for the actual rudder, ring for the helm order).

On desktop, aim the **+** reticle at a control. Click buttons and switches. Click and drag the lever (mouse up/down) and the wheel (mouse left/right).

## Local development

You need Node 20+ (22 recommended).

```bash
npm ci            # install exact locked versions
npm run dev       # HTTPS dev server on https://localhost:5173 and your LAN IP
npm test          # unit tests (physics/sim run headless in Node)
npm run build     # typecheck + production build into dist/
npm run trials    # hydrostatics, GZ curve, inclining + free-decay tests, sea trials (see docs/TESTING_NEW_BOATS.md)
npm run preview   # serve the production build over HTTPS on :4173
```

> Use `npm ci` rather than `npm install`. npm 10 has a bug ("Cannot read properties of null (reading 'edgesOut')") that is triggered by vitest's optional peer dependencies. If you need to add a package, run `npx npm@11 install <pkg>`.

### Testing on the Quest from your own PC (optional)

The GitHub Pages URL is the easy route. To test uncommitted changes instead:

1. Make sure the PC and the Quest are on the same Wi-Fi.
2. Run `npm run dev`. Vite prints a **Network** URL such as `https://192.168.1.23:5173/`.
3. Open that URL in the Quest browser. The certificate is self-signed, so choose **Advanced → Proceed** once. WebXR requires HTTPS.
4. If the Quest can't reach the PC, allow Node through the PC firewall on port 5173.

**USB alternative:** connect the Quest with a cable, run `adb reverse tcp:5173 tcp:5173`, then open `https://localhost:5173` on the headset.

### Testing VR without a headset

Install Meta's **Immersive Web Emulator** extension (Chrome or Edge Web Store). Then:

1. Open the dev URL.
2. Open DevTools (F12) and go to the **WebXR** tab.
3. Pick **Meta Quest 3**.
4. Click **Enter VR** on the page.

You can move the emulated headset and controllers and press their buttons from the DevTools panel.

## Testing a new boat

There's a built-in "sea-trials lab". It covers hydrostatics, the GZ curve, an inclining experiment, free-decay motions, and speed/turning/stopping trials, all computed from the same hull the game floats. See [`docs/TESTING_NEW_BOATS.md`](docs/TESTING_NEW_BOATS.md). A snapshot of the project at that stage lives on the `sea-trials-lab` branch.

## Project layout

```
src/
  config.ts        every tunable number (waves, mass, thrust, drag, comfort, perf)
  app/             top-level wiring: renderer, XR session, frame loop
  core/            fixed-step loop, ids, intents, WorldState, Simulation.step, math, keyboard
  environment/     time of day + sea state; sun direction, sky/fog/light palette; sky dome
  player/          player state, rig (moving-frame parenting), desktop controller, XR input
  debug/           FPS / draw-call overlay (DOM on desktop, panel in VR)
  ocean/           waves.ts (Gerstner maths shared by CPU physics and the shader), grid, shaders, view
  render/          geometry helpers (vertex-coloured, merged, flat-shaded parts)
  missions/        placeholder only
  vessel/          hull form (stations), vessel defs, state, physics (strip hydrostatics,
                   damping, rigid body), debug intents, view (lofted hull mesh, interpolation)
  audio/           synthesised engine hum (WebAudio, no files)
  controls/        added in milestone 6
tests/             vitest: run in plain Node, no browser
```

### Architecture rules

1. **Input → intents → simulation → state → views.** Inputs never change simulation state directly. They push `Intent`s, which the simulation applies on its fixed 60 Hz tick. Views read state and interpolate between ticks.
2. **State is plain data.** `WorldState` holds only JSON-serializable objects with stable string ids. There are no Three.js objects in it.
3. **Simulation code imports no DOM or scene graph.** `tests/simulation.test.ts` runs it headless in Node.
4. **The local player is just `world.players[localPlayerId]`.**
5. **Static geometry is merged and vertex-coloured into as few draw calls as possible.**

## Dependencies

| Package | Kind | Why |
|---|---|---|
| `three` | runtime | Rendering and WebXR. Its bundled addons provide the VR button, geometry merging and (later) controller models. |
| `vite` | dev | Dev server and bundler |
| `typescript`, `@types/three` | dev | Type checking |
| `@vitejs/plugin-basic-ssl` | dev | Self-signed HTTPS for LAN testing (WebXR requires a secure context) |
| `vitest` | dev | Unit tests for physics and sim, run in Node |
