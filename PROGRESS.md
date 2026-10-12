# PROGRESS

This file lets a new session pick up the work cold. Keep it current at the end of every milestone.

## Project decisions (agreed with the owner)

- **Headset:** Meta Quest 3. The target is 90 Hz, falling back to 72 Hz if needed.
- **Vessel:** a 12 m **displacement** workboat, so no planing or dynamic-lift model. The owner is a naval architect, so naval-architecture terms are welcome.
- **Steering:** a wheel (hydraulic style, about 1.5 turns lock to lock, rudder rate-limited).
- **Deployment:** GitHub Pages from the dev branch. The repo is public. URL: https://tartanski-cpu.github.io/SWVR/
- **Default locomotion: grab-the-world.**
  - Grip on empty space drags the player in vessel-local space.
  - Gripping with both hands rotates.
  - Grip on a control grabs the control instead.
  - Smooth stick movement is optional. The right stick snap-turns.
  - Teleport is not planned.
- **Physics:** a hand-written rigid-body integrator. No Rapier for now (about 1.5–2 MB of WASM, over the size limit, and buoyancy and hydrodynamic forces are custom anyway). Revisit when we need collisions between bodies.
- **Branch:** `claude/admiring-dirac-v9wwih`.

## Milestones

| # | Milestone | Status |
|---|---|---|
| 1 | Scaffold: Vite + TS + Three, desktop camera, Enter VR, debug overlay, HTTPS LAN server, Pages deploy, fixed-tick sim skeleton | **Done** (VR verified by owner on Quest 3; desktop keys reworked for QWERTZ) |
| 2 | Ocean: Gerstner shader + matching CPU height (with horizontal-displacement inversion), sky dome, sun, fog | **Done** (owner: "Stormworks-like, feels alive", 90 fps on Quest 3) |
| 3 | Floating hull: strip-theory hydrostatics on hull stations, damping, debug view | **Done** (owner OK; drop-test rebound fixed in M4) |
| 4 | Single-engine propulsion, rudder, resistance curve, keyboard/VR-stick driving, sea trials, engine hum, boarding | **Done** (owner tested in VR) |
| 5 | Walk-in wheelhouse, bulwarks, walk areas, grab-the-world locomotion, snap-turn, comfort options, controller models | **Done** (owner asked for BeamNG-style motion coupling: done) |
| 6 | Interaction system, lever, wheel, start/stop, horn, nav-lights switch, live displays, haptics, nav lights; slow-revving diesel drivetrain | **Done, awaiting owner test** |
| 7 | Polish: headset profiling, tuning, docs | — |

## Done (milestone 1)

- **Tooling:** Vite 8, TypeScript 7 (strict), Three r186, vitest. All versions are pinned exactly.
- **Fixed-step loop:** `src/core/loop.ts` runs the sim at 60 Hz with an accumulator. It caps ticks per frame and returns an interpolation alpha.
- **Sim skeleton:**
  - `WorldState` (plain JSON data).
  - `IntentQueue`.
  - `stepWorld()`, which routes intents by target entity id.
  - `IdFactory`.
  - The local player as a normal entry in `world.players`.
- **Environment:**
  - Sun direction from time of day using real solar geometry (latitude and declination in config).
  - Sky, fog and light palette keyed by sun elevation.
  - Time of day changes through the intent path (N / M).
- **Player rig:** a Group containing the camera. Later it gets re-parented to the vessel.
- **Desktop:** a pointer-lock fly camera.
- **WebXR:**
  - VRButton with the `local-floor` reference space.
  - Foveation and framebuffer scale from config.
  - Requests 90 Hz on the Quest.
  - Gamepad polling with button edges and haptic pulses (`player/xrInput.ts`).
- **Debug overlay:** FPS, average and max frame time, draw calls, triangles, tick and time. It's a DOM panel on desktop and a panel on the rig in VR. Toggle with F3/I or B/Y.
- **Keyboard layout:** the owner uses a **German QWERTZ keyboard**.
  - All bindings live in `src/core/keybindings.ts` and are bound by physical key (`KeyboardEvent.code`).
  - The help panel is generated from that file and labels keys with the user's layout via `navigator.keyboard.getLayoutMap()`.
  - Avoid punctuation keys for bindings; they move around between layouts and need AltGr on German keyboards.
- **Placeholder scene:** flat sea, a 4 × 4 m raft, a test cube and a ring of buoys. Static geometry is merged into one draw call; the whole scene is 2 draw calls.
- **Tests (9):** loop timing, headless 60 s sim run, JSON round-trip of the world, intent application, sun geometry.

## Done (milestone 2)

- **Sea state:** `world.environment.waves` holds 8 Gerstner components (serializable, so a host can change the sea state later). They are tuned by eye for a moderate wind sea:
  - Hs ≈ 1.25 m (4σ of the sum), periods 2–7 s.
  - Waves travel towards the NE with ±35° spread.
  - Q = 1 (true deep-water orbit).
  - Σ Q·k·A ≈ 0.2. This must stay < 1: it guarantees no looping crests and that the CPU inversion converges.
- **Wave maths:** `src/ocean/waves.ts` is the single source of truth.
  - `prepareWaves(components, t)`: per-component k, ω (deep-water dispersion), direction, and phase wrapped to [0, 2π) on the CPU in double precision. These are fed straight to the shader as uniforms.
  - `surfaceHeight(x, z)`: inverts the horizontal Gerstner displacement by fixed-point iteration (4 iterations, sub-mm), then sums the heights.
  - `sampleSurface(x, z)`: height, analytic normal, and particle orbital velocity. The velocity is for buoyancy damping relative to the water in milestone 3.
- **Ocean view:**
  - One graded grid: 1 m cells out to 32 m, then growing 8 % per cell out to 3 km. That's about 42k vertices and 84k triangles in 1 draw call.
  - The grid follows the viewer, snapped to 1 m so the dense centre never swims.
  - Each wave is faded (visually only) where cells exceed λ/4. The shortest 2 s wave fades from about 40 m out, so the CPU and GPU agree exactly near the player, which is where physics matters.
  - Shading: flat facet normals via derivatives, Schlick Fresnel sky reflection (scaled by `reflectionStrength`), Blinn-Phong sun glint, faint crest tint, and linear fog matching THREE.Fog.
- **Sky:**
  - A gradient dome with sun disc and glow, sharing one palette with the fog and the ocean reflection.
  - Below the horizon it stays at the horizon colour, so the far ocean edge has no seam.
- **Test scene:**
  - A pile-mounted observation platform (deck at +3 m, handrails). The player rig stands on it.
  - Ten floating buoys posed from `sampleSurface()` (1 instanced draw).
  - 24 magenta surface probes plus 1 that follows a point 6 m ahead of the viewer. Toggle with P.
- **Render timing:** views render at `(tick − 1 + alpha)·dt`, one tick behind the sim. Boat interpolation in milestone 3 will use the same convention, so hull and water can't drift apart visually.
- **Tests (16):** dispersion, Hs range, no-loop condition, inversion accuracy over 600 random points at 3 times, analytic normal vs finite differences, orbital velocity vs time derivative, calm sea.

## Done (milestone 3)

- **Buoyancy method (agreed change from the original columns plan):** strip-theory hydrostatics on the real hull shape.
  - The hull is 17 transverse stations (`vessel/hullForm.ts`), hard-chine sections with 5-point polygons.
  - Each tick, each station samples the waves at port chine, centreline and starboard chine. It clips its polygon at that (linear) waterline and applies ρ·g·A·w at the immersed centroid (trapezoidal weights).
  - This gives true displacement, LCB and the large-angle GZ curve, including deck-edge immersion.
  - The same stations loft the visible hull, so the drawn waterline and the physics agree.
- **Hull particulars at DWL** (from the stations):
  - LOA 12 m, beam 4.2 m at deck and 3.7 m at chine, keel 0.95 m below DWL, 16.6° deadrise aft.
  - Displacement 17.9 m³ = 18.35 t. Mass is set to 18.3 t.
  - LCB 2.25 m aft of amidships, and the LCG is set to match.
  - KB 0.62 m. VCG +0.45 m (KG 1.40 m) gives GM ≈ 1.17 m.
  - GZ ≈ 0.20 m at 10°, 0.36 at 20°, 0.45 at 30–45°, and still +0.32 at 60°.
- **Dynamics** (`vessel/physics/vesselPhysics.ts`): a rigid body at the CG with semi-implicit Euler, body-axis angular velocity, the gyroscopic term, and quaternion integration.
  - Added mass and inertia per axis (surge 5 %, sway 40 %, heave 60 %, roll 25 %, pitch 60 %, yaw 30 %), scaled by immersion.
  - Vertical damping on the centreline of each station, against velocity relative to the orbital water velocity.
  - Lateral and longitudinal quadratic + linear drag per station, also relative to the water. The centre of lateral resistance emerges from the hull shape.
  - Explicit angular damping, with roll at about 10 % of critical.
- **Measured (headless, calm water):** sinkage 1 mm and trim 0.02° at rest. Natural periods: heave 1.9 s, pitch 2.3 s, roll 3.7 s. Roll decay from 10°: 7.0, 4.9, 3.5, 2.4, …
- **Measured in the default sea (Hs ≈ 1.25 m):**
  - Head/following seas: max heel about 5°, trim about 10°.
  - Waves 45° off the bow: up to about 15°.
  - **Beam-on: up to about 26° roll**, because the 3.6 s wave component is at roll resonance.
  - Drift about 1 m in 2 minutes. Physics cost about 60 µs per tick.
- **Interpolation:** `VesselView` snapshots the pose before each tick and lerps/slerps by alpha. Ocean render time uses the same (tick − 1 + alpha) convention.
- **Debug:**
  - Hydro view (V): station outlines, immersed centroids, buoyancy arrows (10 kN = 1 m) and the CG.
  - Overlay shows heel, trim, heave and immersed tonnage.
  - Test intents: drop from 4 m (R / right A) and heel 20° (K / left X). Both go through the normal intent path.
- **Tests (26):** section clipping, displacement = mass at DWL, calm equilibrium, 4 m drop, roll period and decay, positive GZ at 45°, 2 minutes in waves, JSON round trip.

## Done (milestone 4)

- **Drop-test rebound fixed** (the owner spotted the bow-up trim).
  - Cause: no energy loss on water entry. The hull plunged 1.6 m and rebounded 2.8 m clear of the water. While fully immersed, the centre of buoyancy moved forward into the high, flared bow, giving 33° bow-up.
  - The wheelhouse has no buoyancy and was not involved. Mean trim in waves is only about −0.3°.
  - Fix: a quadratic water-entry drag on each station's waterplane strip (`damping.verticalCd`). Now: plunge 0.5 m, rebound 0.24 m, ±3° trim. Seakeeping is unchanged.
- **Propulsion** (`vessel/physics/propulsion.ts`), single engine as the owner asked:
  - Engine: 180 kW diesel, idle 700, max 2300 rpm, RPM-governed with first-order spool (4 s up, 0.9 s down).
  - Cranking takes 1.6 s, and the engine starts only with the lever in neutral (neutral-safety switch).
  - Gearbox: 2.4:1 reverse/reduction. One combined lever with a ±8 % neutral detent. The clutch engages only after the lever is held for 0.6 s with the engine near idle; going to neutral is immediate.
  - Propeller: 0.7 m fixed pitch, K_T = 0.45·(1 − J/1.05), astern at 45 % efficiency, w = 0.15, t = 0.15. T(1 − t) is applied on the shaft line, and thrust fades as the propeller emerges.
  - Rudder: 0.36 m² spade, hydraulic at 14°/s to ±35°. Normal-force model with C_N slope 2.4 per rad, stalling at 25°.
  - Rudder inflow: hull flow (with wake and 50 % flow straightening) plus the propeller slipstream from momentum theory. **The slipstream's extra rudder force is capped at 0.45·T** (it can't exceed the momentum the slipstream carries). Without the cap the boat pirouetted.
  - Resistance: ITTC-57 C_F·(1 + 0.2), applied at mid-draft at the LCG against speed through the water, plus Δ·g·(Fn⁴ + 0.94·max(0, Fn − 0.3)²). Astern ×2.6.
  - Wetted surface is computed from the stations.
- **Hull lift added to the manoeuvring forces:** a lateral force ∝ ½ρ·a·A·U·v per station, a = 1.2. This gives the linear Y_v/N_r damping; without it, turning collapsed into a spin.
- **Sea trials** (`npm run trials`, in-game key T, and asserted in `tests/seaTrials.test.ts`), calm water:
  - Speed vs lever 25/50/75/100 %: 5.1 / 7.0 / 8.2 / **9.2 kn** (996 → 2300 rpm). 0 → 90 % top speed in 10.8 s. Full astern 6.4 kn.
  - Turn at full ahead, hard over: advance 2.8 L, transfer 1.4 L, **tactical diameter 3.3 L**, steady turning diameter 3.2 L, 7.7 kn in the turn, about 5° outward heel.
  - **Crash stop 2.0 L in 10 s.** Coast to 1 kn 7.2 L.
- **Controls as intents:** `lever`, `helm`, `engineStartStop` (vessel) and `board` (player, with `Intent.ref` = vessel id). Values are absolute.
  - Keyboard: arrows, X, G, E.
  - VR: right stick, right stick click.
  - These are debug paths; milestone 6 replaces them with physical controls that send the same intents.
- **Boarding** (B / left stick click): player state `aboardVesselId` plus a vessel-local position. The rig is re-parented to the vessel's interpolated root and stands on the aft deck. This is the moving-frame foundation for milestone 5. No locomotion or comfort options yet.
- **Overlay:** speed over ground, heading, rpm or engine state, lever %, gear, rudder angle, heel, trim, heave, immersed tonnage.
- **Engine audio:** WebAudio sawtooth at firing frequency (rpm/20 for a 6-cylinder four-stroke) plus a half-order square wave, low-passed by RPM and load. Turbo hiss grows with load, there's a cranking wobble, and volume falls with distance. Unlocked on the first click, key press or entering VR.

## Sea-trials lab (owner request after milestone 4)

- `src/vessel/hydrostatics.ts`: upright particulars and a fixed-trim GZ curve with free sinkage, from the hull stations.
- `src/vessel/seaTrials.ts`:
  - Speed, turning and stopping trials.
  - `runMotionTrials`: heave, pitch and roll natural periods; roll decay and damping ratio; a dynamic inclining test that back-calculates GM.
- Trials and hydrostatics run per vessel definition. `VESSEL=<id> npm run trials` runs one vessel.
- `tests/seaTrials.test.ts` checks that GM agrees three ways (formula, small-angle GZ, inclining). Current values: 1.19 / 1.19 / 1.20 m.
- **Any vessel works end to end:** vessel-specific values (spawn, boarding spot, engine for audio) now come from `VesselDef` rather than `CONFIG.vessels.workboat`. `testScene.vesselDefId` picks the vessel in the scene.
- **Keys:** L toggles flat calm / moderate sea (environment intent `seaState`). T shows hydrostatics plus trials in game.
- **Guide:** `docs/TESTING_NEW_BOATS.md`.
- **Snapshot:** branch `sea-trials-lab` points at the commit that introduced this. It is a snapshot to revisit, not a line of development; the lab keeps evolving on the main development branch.

## Done (milestone 5)

- **Owner feedback from M4, fixed:**
  - "Boarded behind the wheelhouse, can't see forward": boarding now puts you at the helm inside the wheelhouse, facing forward.
  - "Right stick doesn't start the engine": clicking the stick nudged the lever (also on the right stick) out of neutral, and the neutral-start interlock refused silently. Engine start/stop moved to **A**. A refused start now gives a message and a haptic buzz. Right stick click sets the lever to neutral.
- **Deck layout** (`layout` block in the vessel config, shared by the geometry and the walk area):
  - Walk-in wheelhouse 2.9 × 3.4 m with a 2.15 m interior height, a window band all round (sill 0.95 m, head 1.75 m above the floor), and an aft doorway 0.8 × 2.0 m with a sill.
  - Helm console across the front.
  - Floor at +1.2 m, above the sheered deck under the house.
  - Bulwarks (0.3 m) and handrails (1.0 m) with stanchions along the deck edge and across the transom.
  - All merged into the hull's single draw call.
- **Walk area** (`vessel/layout.ts`): `walkable(x, z)` (body radius 0.22 m), `floorY(x, z)` (deck sheer or wheelhouse floor) and `insideSolid(x, y, z)` (walls, console, roof, below deck). Window band and doorway count as open. There's also a platform walk area for off-boat.
- **Rig hierarchy:** vessel root → *carrier* (feet position plus horizon correction) → *root* (yaw, XR floor origin) → camera, controller grips, wrist panel. PlayerState.position and yaw are vessel-local and client-authoritative.
- **Locomotion** (`player/locomotion.ts`), all in the vessel frame. Collision is on the head position and slides along walls; it's always allowed to escape if the head is already somewhere unwalkable.
  - Grab-the-world, the default: one grip translates. Two grips rotate about the hands' midpoint and translate. Re-anchors whenever the set of gripping hands changes. Haptic tick on grab.
  - Optional smooth movement on the left stick (head-relative, 1.4 m/s).
  - Snap turn 30° about the head on the right stick, with hysteresis.
  - The floor height follows the head with 0.12 s smoothing (the doorway sill step).
  - Desktop walks through the same collision; F toggles free-fly.
- **Comfort** (`player/comfort.ts`):
  - **Motion coupling slider, BeamNG-style** (owner request after testing; replaced the fixed horizon-steadying presets).
    - The deck's world attitude is split into heading and tilt: q = Yaw·Rx(pitch)·Rz(roll). Heading and horizontal position always follow the deck exactly, so walking and collision are unchanged.
    - The view's pitch, roll and **heave** follow *coupling ×* the deck's, through a critically damped spring-damper. Its time constant is 0.12 s at 100 % and grows as (1 − c)² to 1.6 s at 0 %.
    - Gross, slow motion gets through; wave-frequency roll, pitch and heave are soaked up, like neck and vestibular reflexes.
    - Heave is measured from an 8 s low-passed reference height.
    - The deck-to-view vertical offset is soft-limited (tanh) to 0.4 m, the "knees".
    - Output: a carrier rotation C = T⁻¹·T_player plus a world-vertical offset.
    - **Default reverted to 100 % (rigid) after VR testing.** The controllers live in the same rig as the head, so decoupling the view also moved the hands relative to the deck (up to 0.4 m heave), and the bridge controls became hard to grab. The slider is still available. VR: hold X + left stick. Desktop: 9 / 0. Persisted in localStorage under `swvr.motionCoupling.v2`; older saved values are ignored.
    - Possible later refinement: automatically ease back to rigid while a hand is near or holding a control, so lower settings stay usable at the helm.
  - **Measured** (±15° roll at 3.5 s, ±0.5 m heave at 4 s): coupling 100/75/50/25/0 % → roll felt ±15 / 9.8 / 4.2 / 1.0 / 0°, heave ±0.50 / 0.34 / 0.18 / 0.16 / 0.16 m.
  - Head-locked tunnel vignette while artificially moving or snap-turning.
  - Fade to black when the head is inside structure (room-scale).
- **Controllers:** real Touch controller models via `XRControllerModelFactory` (fetched from the WebXR input-profiles CDN). The debug panel rides on the left wrist.
- **Messages:** the overlay has `notify()`, a toast shown on desktop and on the wrist panel in VR.
- **Lighting:** the hemisphere sky light now blends zenith toward horizon and is 35 % stronger. Shaded white paint was reading navy.
- **Tests (48):** motion decoupling (rigid at 100 %, level at 0 %, attenuation at 50 %, steady heel followed and heading untouched), walk area (helm walkable, walls/console/outboard not, window band and doorway open), walking aft deck → doorway → helm, wall collision, grab direction, snap turn.

## Done (drivetrain rework, owner request before milestone 6)

The owner asked for "a diesel inboard, not a revvy outboard, with a bigger prop for torquey manoeuvring and, eventually, towing".

- **Engine is now a shaft torque balance**, not an RPM target:
  - (I_e + I_p/i²)·dω/dt = rack·Q_max(rpm) − (a + b·rpm) − Q_prop/(i·η).
  - Torque curve of a 200 kW heavy-duty 6-cylinder: idle 600, rated 1800, peak about 1320 N·m at 1300 rpm, cut-out at 1950.
  - Droop governor (full rack 120 rpm below the set speed). Turbo/smoke limiter: the rack rises at most 0.45 per second.
  - Starter torque and cranking.
- **Gearbox:** 3:1 reverse/reduction. The clutch picks up the stationary prop with an angular-momentum RPM dip.
- **Propeller:** 1.05 m, P/D about 0.85. K_T = 0.38·(1 − J/0.88) and K_Q = 0.045·(1 − J/0.98) give open-water efficiency about 0.5. Astern: 50 % thrust, 90 % torque. w = t = 0.18.
- **Rudder** enlarged to 0.55 m² to suit the bigger, slower slipstream (the 0.36 m² one lost authority).
- **Audio:** the same synth, fundamental rpm/20 (30 Hz at idle, 90 Hz at rated). Load comes from the fuel rack.
- **Trials:**
  - Full ahead 9.5 kn at 1681 rpm (93 % of rated).
  - **Bollard pull 2.28 t at 1367 rpm** (the RPM sags under load). Astern bollard pull 1.2 t.
  - Tactical diameter 3.0 L. Crash stop 1.6 L. 0 → 90 % of top speed in 7.3 s.
  - Astern 6.4 kn (still optimistic).

## Done (milestone 6: bridge controls)

- **Control component system** (`src/controls/`):
  - `Control` base: object tree in the vessel frame, hit objects for rays, `distanceTo` for proximity, grab/press lifecycle, hover highlight. Sends **absolute** values through `ctx.emit(channel, value)`, which becomes an intent. `sync(state)` shows the authoritative state except while locally held.
  - `Lever`: pivots about local X. Hand angle atan2(z, y) with a grab offset (no jump). Clamped ±40°. Magnetic neutral detent with haptic clicks.
  - `Wheel`: rim in local XY. Accumulates wrapped hand-angle changes, averaged over the hands holding it (two-handed). 1.5 turns lock to lock, spoke ticks every 30°, a stop bump.
  - `Button`: momentary (horn) or pulse (start/stop). The cap travels, and the start button glows when running.
  - `Toggle`: nav-lights switch.
  - `InstrumentPanel`: speed, heading tape, RPM dial with gear/state/load, and rudder indicator showing actual rudder plus helm order. One 1024×512 canvas atlas and one merged mesh, redrawn at 10 Hz.
- **Interaction system:**
  - VR: per hand, direct grab (grip within 9 cm of a lever knob or the wheel rim) or direct press (controller tip within 6 cm plus trigger). Otherwise a 1.5 m pointer-ray fallback with a visible line.
  - Hands holding or hovering a grab control are "busy", so their grip doesn't drive grab-the-world.
  - Haptics on touch, grab, detent, spokes, stop and press.
  - Desktop: screen-centre reticle (pointer lock) with the control's name. Click buttons; click-and-drag nudges the lever (mouse up/down) or wheel (left/right) with mouse-look frozen.
- **Bridge layout is data** (`vessels.workboat.bridge`): wheel, lever, buttons, switch, instrument dash and display positions. Engraved labels on the console are one draw call.
- **New vessel controls:** `navLights` and `horn` (intents and state).
- **Navigation lights:** masthead, sidelights and stern light. Lamp housings dim when off; additive glow, stronger at night. Arcs of visibility aren't modelled.
- **Horn:** low two-tone sawtooth chord (150/188 Hz plus harmonic), sharing the engine's AudioContext.
- **VR debug driving removed** (right stick and triggers), as is A for the engine; you drive from the bridge. Keyboard debug driving is kept on desktop.
- The refused-start message also appears when you press the physical start button with the lever out of neutral.
- **Tests (60):** lever direction, travel and detent, no jump on grab, state sync; wheel direction, multi-turn to the stops, rim reach; button momentary vs pulse; toggle; interaction-system grab, busy hand, release; plus all earlier tests.

## Done (owner feedback after milestone 6)

- **Lever and wheel followed where the controller pointed, not the hand.** Every hand carried its pointer ray, and grab controls projected that ray onto their plane even for direct grabs.
  - Fix: grab controls are **hand-only** and receive positions only. The pointer ray now targets buttons and switches only.
  - The lever follows the hand's fore-aft travel as arc length at the knob: θ = θ₀ + Δz/length. That's independent of where it's gripped.
  - Grab radius raised to 12 cm.
- **Motion-coupling adjustment didn't work in VR** (hold X + stick). The value was rounded to whole percent every frame, swallowing the tiny per-frame stick increments. Now kept at full precision and rounded only for display.
- **Vertical movement: ladders and multi-level walking.**
  - The WalkArea is now multi-level: `floorsAt(x, z)`, `walkable(x, z, y)` (only floors within a 0.4 m step of the feet count), `ladderAt(x, z)`.
  - Levels: open deck, wheelhouse floor, and a **walkable railed wheelhouse roof**.
  - **Ladder** on the aft face of the wheelhouse (starboard of the door), deck to roof, with stiles carried 1 m above the roof as handholds.
  - Grab-the-world applies the vertical part of a pull only at a ladder (pull down = climb up). Elsewhere vertical pulls are ignored (no flying).
  - On a ladder you hang on (no gravity). Off it, gravity settles you onto the highest floor within a step below, so stairs and sills work the same way.
  - Desktop: Space / C climb at a ladder.
- **Tests (67):** multi-level walk area, ladder hand-over-hand climb to the roof and step-off, lever follows the hand even when pointing away, the pointer ray presses buttons but never grabs levers.

## Done (owner feedback, round 3)

- **Stronger rudder, especially power-on.** Slipstream allowance raised from 0.45 to 0.55·T, wash factor from 0.6 to 0.8, stall angle from 25° to 28°. Tactical diameter went from 3.0 L to 2.4 L, holding 7.1 kn in the turn. A first try (0.7·T, C_N slope 2.6) overshot to 1.8 L.
- **Prop walk.** Right-handed prop: side force at the prop of 3 % of thrust ahead (stern to starboard) and 12 % astern (stern to port), fading with speed (half at 1.5 m/s). Config: `propeller.rightHanded`, `propWalkAhead`, `propWalkAstern`, `propWalkFadeSpeed`. Tests: going astern from rest the bow swings to starboard; the effect ahead is smaller and opposite.
- **Taller wheelhouse windows.** The window band now runs 0.75–1.95 m above the floor (was 0.95–1.75). It's shared by the geometry and the head-in-wall check.

## Planned next (owner requests, not started)

1. **Fuel and oil temperature (engine management, refuelling).** Fits the existing structure:
   - New fields in the serializable `EngineState`: `fuelL` (tank litres) and `oilTempC` / `coolantTempC`.
   - Fuel burn from the torque balance already computed: fuel flow = BSFC(load) × engine power, with BSFC about 210–230 g/kWh near rated. At idle it's a small constant.
   - Oil/coolant temperature: a first-order thermal model. Heat in ∝ power, heat out ∝ (T − sea temperature) through the heat exchanger, a thermostat at about 82 °C. Overheating derates the governor (rack cap) and can trip an alarm.
   - Engine stops when the tank is empty. Refuelling is a vessel intent (`refuel`, litres) that a quay or fuel-hose interaction can send later.
   - New displays (fuel gauge, temperature gauge, alarm lamp) slot into the instrument atlas, and the sea-trials report gains fuel consumption: L/h at speed and range.
2. **VR menu** to replace the growing list of debug keys and button combinations.
   - A wrist-mounted menu panel on the left hand. Open it by turning your palm up or with Y. Operate it by poking with the right index or using the existing pointer ray.
   - It would reuse the `Control` components (Button, Toggle, plus a new Slider) on a panel that follows the left grip.
   - Contents: motion coupling slider, smooth-walk on/off, snap-turn angle, sea state, time of day, buoyancy/probe debug views, sea-trials report, drop/heel tests, board/leave.
   - The keyboard bindings stay for desktop.

## Future roadmap (owner notes, not started)

3. **A small explorable archipelago with ports.**
   - Islands as static, merged low-poly terrain meshes: a heightfield or hand-placed cones and ridges, flat-shaded like the boat.
   - A world map/registry module (`src/world/`) holds island outlines, depth contours and port definitions as data: berths, fuel points, mooring bollards.
   - The water needs a depth field, so waves can shoal or break near shore and the hull can ground.
   - Collision: hull stations against a terrain/depth query (cheap, same pattern as the wave query). Simple box/capsule colliders for quays and pontoons.
   - Ports are walkable areas (the existing multi-level WalkArea) that players can step onto from the boat.
   - Moorings and fenders would want contact forces, the point to revisit Rapier versus a hand-written contact model.
   - **Performance:** keep islands to a few draw calls each, and cull or LOD by distance (fog helps).
4. **Dynamic weather.**
   - `EnvironmentState` already holds the sea state (wave components) and time of day. Add wind (speed, direction), visibility (fog density), cloud cover and rain intensity.
   - A slow weather simulation interpolates between weather presets, building and decaying the wave components, which are scaled from a target Hs and Tp. A JSONSWAP-style fit is possible later.
   - **Wind on the boat:** windage force and moment on the topsides and wheelhouse (projected areas from the layout).
   - **Visuals:** sky and fog palette darkened by cloud, rain particles (one draw call), whitecaps on the ocean shader.
   - Host-authoritative like the rest of the environment, so all players see the same weather.
5. **Map and charts.**
   - A chart display (canvas atlas page) rendered from the world registry: coastlines, depth contours, ports, buoys, plus own-ship position, heading and track history. It could be a chartplotter screen on the dash, a paper chart on the chart table, or a page on the wrist menu.
   - GPS position in the vessel state (already known: world position). Waypoints and a course-to-steer readout could feed an autopilot later, which would just be another intent source driving `helm`.

## Decision: ocean masking inside the hull (deferred)

The deck and wheelhouse floor are opaque and sit well above the DWL (freeboard about 0.95–1.5 m), so the sea can't show "through" the boat. The only remaining case is green water overtopping the bulwark in big rolls, which is physically what happens; it would need a "freeboard volume" mask to hide. I'll revisit in the polish pass if it's visible in practice. It matters for a future open well-deck or a low-freeboard rescue boat.

## Open questions for the owner

- **Beam-sea roll of about 26°.** Physical. Comfort options now exist; does it need more roll damping or GM?
- **Astern speed of 6.4 kn** may be optimistic.

## Next

Milestone 7: polish pass.
- Profile on the Quest: draw calls, frame time, foveation, framebuffer scale.
- Tune handling and comfort from owner feedback.
- Sidelight arcs of visibility.
- Finish the docs and the multiplayer write-up.

## Known issues / notes

- Headless SwiftShader (used for automated screenshots) mis-renders geometry below the horizon when the camera pitch is exactly 0. Real GPUs are unaffected. The desktop camera starts tilted slightly down.
- npm 10 crashes with `edgesOut` when adding packages because of vitest's optional peer dependencies. `npm ci` works. Use `npx npm@11 install` to add dependencies.
- The ocean at night is very dark (no moon yet). A moon and night palette come with the day/night work later.
- **Water inside the hull:** the ocean is drawn wherever it is, so a wave that overtops the deck edge or a steep crest beside the hull can show water "inside" the boat. That will matter once we walk inside (milestone 5). The plan is a depth/stencil mask of the hull interior volume.
- No collisions yet: the boat drives straight through the buoys and the platform.
- Debug driving in VR: right stick ↑/↓ for the lever (only when clearly vertical, so snap-turn doesn't move it) and triggers for the wheel. Temporary until the bridge controls exist (milestone 6).
- Controller models need internet on the headset (CDN). Without it, the hands are invisible but still work.
- Wave fading at distance means far-away objects (more than about 40 m from the viewer) can sit a few cm off the drawn surface for the shortest waves. Physics always uses the exact CPU surface.
- There are no whitecaps or foam yet beyond a faint crest tint. A moderate sea would show some whitecaps; that's a candidate for the polish pass.

## Multiplayer recommendation (for later — not implemented)

**A host-authoritative simulation over WebSockets**, running the same `stepWorld()` code headless in Node. This is possible because the sim has no DOM or Three.js dependencies.

- **Clients to server:** clients send `Intent`s, which are already the only way input changes state.
- **Server to clients:** the server ticks at 60 Hz and broadcasts snapshots or deltas at about 20 Hz.
- **Clients:** interpolate vessels about 100 ms behind. The local player's own controls are shown predictively while held, which the control design already does.
- **Player bodies:** client-authoritative, in vessel-local coordinates. They are cosmetic, so trusting clients is fine for co-op.
- **Why not peer-to-peer WebRTC first:** it avoids a server but needs signalling and NAT traversal, and makes one player's browser the host. A data-channel transport can be added later behind the same intent/snapshot interface if hosting costs matter.
