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
| 6 | Interaction system, lever, wheel, start/stop, horn, nav-lights switch, live displays, haptics, nav lights; slow-revving diesel drivetrain | **Done** (owner tested in VR; three feedback rounds) |
| 7 | Polish: headset profiling, tuning, docs | **Done** (owner to read the new frame-time panel on the Quest) |

**The MVP is complete.** A snapshot of this state lives on the `mvp-1` branch.

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

## Done (milestone 7: polish)

- **Profiling readout** in the debug panel (B / Y in VR, F3 on desktop):
  - **cpu:** main-thread time per frame, split into sim / views / render submit.
  - **gpu:** GPU time via `EXT_disjoint_timer_query_webgl2`, where the browser exposes it (else "n/a").
  - **XR line:** framebuffer size, refresh rate, foveation and scale.
  - The overlay doc comment explains how to read it against the 11.1 ms budget at 90 Hz.
- **Cheaper frames:**
  - The bridge's fixed parts (dash, lever quadrant, button housings, switch plate, wheel shaft) are baked into one draw call. Draw calls aboard went from 23 to 17 per eye. The hidden originals stay as ray targets.
  - The instrument canvas skips its redraw and texture upload when the dash is more than 12 m away or behind you.
  - The exhaust smoke skips its update and draw when no particle is alive. Particles fade out within about 2 m of your head, so backing into the plume doesn't fill the view with big overlapping sprites (fill rate and comfort).
- **Faster reloads:** three.js is split into its own cached chunk (631 kB). The game code is now 104 kB, so a redeploy re-downloads only that.
- **Roll damping** raised from 24000 to 33000 N·m·s, at owner request. Free decay from 10° now gives 15 % of critical (was 11 %); natural period 3.5 s. Astern speed is left as is, per the owner.
- **Sidelight arcs of visibility** (COLREGs Rule 21):
  - Masthead light: 225° ahead.
  - Sidelights: from right ahead to 22.5° abaft the beam.
  - Stern light: 135° astern.
  - A 2° practical cut-off at the edges.
  - Bearings are measured from the centreline, so both sidelights show from dead ahead.
- **Clean-up:**
  - `App.ts` is split into `xrSession.ts`, `desktopPointer.ts`, `debug/trialsPanel.ts`, `debug/vesselReadout.ts` and `vessel/view/vesselEffects.ts` (nav lights and smoke per vessel). Coupling persistence moved to `comfort.ts`.
  - The empty `missions/` placeholder is removed (its intended shape is noted under "Next").
  - Stale milestone comments are fixed.
- **Docs:** README brought up to date. New `docs/MULTIPLAYER.md` covers the host-authoritative design, message types, the change needed per module and the order of work.

## Done (VR menu, owner request after the MVP)

- **The menu:**
  - In VR, **Y** opens a menu on the left wrist: one canvas quad, one draw call. B now toggles only the perf/debug panel.
  - On desktop, **O** opens the same menu floating in front of you, operated with the reticle and a click.
- **Operating it with the right controller:**
  - **Poke** a button with the controller tip. A press fires as the tip reaches the surface from the front, and re-arms after you pull back 2 cm, so you can't double-press or press from behind.
  - Or **point** the ray (orange line) and pull the trigger.
  - While the right hand is on the menu, its trigger is withheld from the bridge controls.
- **Contents:**
  - Time of day (±1 h, ±10 min) and time flow (stopped / ×60 / ×600).
  - Sea state.
  - Motion coupling, stick walking, snap-turn angle.
  - Board / leave.
  - Drop and heel tests.
  - The sea-trials report on a 1.1 m panel in front of you.
  - Perf panel, buoyancy view, wave probes.
- **Debug panel placement:** while the menu is open, the debug panel moves beside it.
- **Code:**
  - `ui/menuPanel.ts`: a generic canvas menu; rows of closures; ray and poke hit-testing in the quad's local frame.
  - `ui/mainMenu.ts`: the rows, against a `MenuHost` interface the App implements.
  - `ui/wristMenu.ts`: mounting plus poke/point logic.
  - `ui/placeInFront.ts`.
  - Comfort settings live in `player/userSettings.ts` (localStorage `swvr.settings.v1`; the old coupling key is migrated). Locomotion reads stick walking and snap angle from there.
  - Tunables in `CONFIG.menu`: size, wrist offset/tilt, poke depths, ray length.
- **Tests (77):** menu rows drive the host and highlight the current choice; a poke from the front presses once until backed off; a poke from behind doesn't press; ray + trigger presses but the ray alone doesn't; a closed menu takes nothing.

## Done (fuel, engine temperature, archipelago and harbours, owner request)

### Fuel and engine temperatures

- **Fuel flow** follows the fuel rack, as on a real jerk-pump diesel: indicated power × sfc, with a part-load penalty. Measured: idle 1.7 L/h; 6.7 kn on 11 L/h; 8.3 kn on 26 L/h; 9.5 kn flat out on 49 L/h.
- **Tank:** 600 L, starting with 420 L. The engine stops when it runs dry and won't restart until refuelled.
- **Coolant temperature:** one lumped heat capacity (`thermal.heatCapacity`, about half a real engine's so warm-up takes minutes), heated by 30 % of the fuel energy.
  - Heat is rejected through a sea-water exchanger behind an 80–88 °C thermostat. The exchanger only works while the engine-driven raw-water pump turns, so after shutdown the engine heat-soaks and cools slowly.
  - **Oil** lags the coolant and runs up to 12 °C hotter at full load.
  - **Warm-up:** cold-start under way reaches about 80 °C in 4–5 minutes; idling alone takes about 20 minutes to reach 50 °C.
- **Overheat chain:**
  - Alarm and buzzer above 95 °C.
  - The governor derates the rack to 30 % between 100 and 110 °C.
  - Protection shutdown above 115 °C.
  - The **Pump failure** fault (menu > Tests) cuts the exchanger to 8 %. Flat out, the alarm sounds in about 15 s and the engine shuts down after about 2.5 minutes; backing off to idle saves it.
- **Engine monitor:** a fifth screen behind the wheel, read through the spokes. It shows coolant and oil temperature, fuel litres and L/h, and **HIGH TEMP** / **LOW FUEL** lamps (low fuel below 10 %).
- **Bridge buzzer** (WebAudio).
- **White smoke** from a cold engine, fading as the block warms through 25–60 °C. This was the remaining exhaust item.
- **Sea-trials report:** gains L/h and range (nm, full tank) for each lever setting.

### The archipelago (`src/world/`)

- **Level data:** `archipelago.ts` holds islands, dredged basins and bays ("cuts"), levelled waterfronts ("flats"), breakwaters ("ridges"), quay and pier blocks, buildings, lights, ports and shelter zones. It is plain data, kept separate from the tunables.
- **Terrain:** `terrain.ts` has one analytic `groundHeight(x, z)` for land **and** seabed: coastline harmonics, beaches into hills, and an exponential shelf down to 40 m. The terrain mesh, hull contacts, anchor and depth sounder all use it, so what you see is what you ground on.
- **Islands:**
  - **Calder Holm**, big, with **Calder Haven**: a ~30 m entrance between rubble breakwaters, a dredged 4.5 m basin, a 70 m fendered quay, a fuel pump and a small waterfront.
  - **Brannock**, with a 130 m timber **pier** and T-head in deep water, a fuel pump and a pier-head light.
  - **Rona**, with **Selkie Bay**, a horseshoe **anchorage** (about 9 m, beach and bothy at its head).
  - **Smaller islands:** Eilean Dubh, Tarran (with a lighthouse, Fl W 10 s), Skerry and Gull Rocks (on the direct line to Calder Haven, so mind them).
- **Lights:** IALA A entrance lights at Calder Haven (Fl R 4 s to port and Fl G 4 s to starboard, entering), a fixed red pier-head light, and the lighthouse. They show as constant pixel size at night, so they're visible from miles off.
- **Sheltered water:** the waves are scaled down inside Calder Haven (to 8 %) and Selkie Bay (to 40 %). The same `shelterFactor` is applied at the particle rest position on the CPU (physics) and in the ocean vertex shader (uniforms).
- **Rendering:** about 66k triangles and 4 draw calls (terrain, merged structures, instanced trees, lights). The world builds in well under a second at start-up.
- **Hull contacts** (`physics/contacts.ts`):
  - Penalty springs at keel, chine and deck-edge points on every other station, against the terrain and the quay/pier boxes.
  - Fendered faces are softer and slippery.
  - Friction becomes viscous below 8 cm/s, so a grounded boat settles.
  - Gated by `WorldState.geography`; the sea trials run in `'openSea'`.
- **Contact feedback:** a thump on impact, a scrape while sliding, and a controller jolt if you're aboard.
- **Anchor** (`physics/anchor.ts`), worked by a new **ANCHOR** switch on the console:
  - **Letting go:** chain pays out to 4 × depth + 5 m (60 m of chain).
  - **Chain tension:** a soft catenary-like curve while the chain lifts off the bottom, then a stiff spring once it's taut.
  - **Holding:** about 20 kN, reduced at short scope (full from 3:1); the anchor drags beyond that.
  - **Weighing:** the windlass heaves in, stalling above a 9 kN pull, so it draws the boat up to the anchor, then stows it.
  - **Display:** the chain is drawn from the bow roller, and the menu shows the anchor status.
- **Refuelling:** stop within about 14 m of a fuel berth (Calder Haven quay, Brannock T-head) and press **Refuel** in the menu (Boat tab). Fuel flows at 2.5 L/s and stops automatically if you move off.
- **Echo sounder:** depth under the keel on the speed screen, red below 2 m.

### Menu

- The menu has grown, so it now has **tabs** (Sea & time / Boat / Comfort / Tests) and stays 24 × 22 cm on the wrist.
- **New rows:**
  - Fuel and refuel.
  - Anchor status.
  - Engine faults.
  - Port bearings and ranges (until there's a chart).

### Tests (95)

- **Fuel:** idle and full-load burn, the tank integral, running dry.
- **Temperature:** warm-up and the thermostat holding, the pump-failure overheat (alarm, derate, cool at idle), the protection shutdown.
- **Terrain and structures:** islands vs deep start, basin depths, the quay pushing out through its face.
- **Sheltered water:** Calder Haven waves are less than 15 % of the open sea's.
- **Collisions:** running aground on Brannock at full power (stops on the shore, doesn't pass through or blow up, stays aground); hitting the pier side (bounces off).
- **Anchor:** set in Selkie Bay and holds against the engine astern; weighs and stows; in 40 m all the chain goes out at a poor scope and it drags.
- **Refuelling:** fills at the berth, stops when the boat leaves, refused elsewhere.
- **Menu:** tabs.

## Done (owner feedback: throttle position, wave height)

- **Throttle moved aft:** it was too far forward to reach comfortably in VR, so the lever moved 35 cm aft onto a small pedestal jutting from the console, starboard of the wheel (`bridge.lever.position` and `pedestal`).
- **Sea-state control:** the menu's Sea & time tab has presets (Calm / Slight / Moderate / Rough / Storm) plus ± fine steps on the wave height. The L key cycles the presets.
  - The sea state is one number, `EnvironmentState.seaScale`. Amplitudes scale × s and periods × s^0.3, so a building sea gets steeper as well as longer, like a young storm sea. Pure Froude scaling (constant steepness) looked identical from the boat.
  - **Wave sizes:** Hs ≈ 1.25 m × s, up to 3.6 m. The crest-loop factor goes from 0.24 (Moderate) to 0.35 (Storm), well under 1.
  - **Accuracy:** the wave-height solver's iterations went from 4 to 6, keeping its error under 1 cm in a storm.
  - **Measured beam-on:** Moderate rolls 16° and heaves 1.5 m; Rough 25° and 2.8 m; Storm 31° and 4 m.
  - **Whitecaps:** grow with the sea's steepness (shader uniform `uFoamAmount`).
- **Tests (97):** storm-sea scaling, and riding out a storm under way (stays finite, never past 60° of tilt).

## Done (wake and spray, owner request)

Frame-rate friendly: 3 extra draw calls, a few hundred vertices, and almost no CPU.

- **Wake** (`vessel/view/wakeTrail.ts`): a foam ribbon from the transom.
  - **CPU work:** one trail point every 1.2 m (or every 0.35 s while the prop churns at rest). Each records the water's REST position at the transom (inverted through the wave model), the beam direction, the time, and the strength of the arms (from speed) and the prop wash (from thrust). Strips break on a jump or a gap.
  - **Vertex shader:** spreads each point across 9 vertices, with the half-width growing with age (a softened 19.5° Kelvin spread). It then displaces them with the SAME Gerstner sum as the ocean, now a shared chunk `ocean/shaders/gerstner.glsl`. So the foam rides the swell exactly and drifts with the orbital motion, like real foam.
  - **Fragment shader:** bright Kelvin arms at the edges and a narrow prop-wash core that fades in 9 s, with clear water between. A noise texture fixed to the water breaks the foam up, and it thins into patches over its 26 s life. It's lit by the scene and fogged.
  - **Lessons:** fewer vertices across let the flat strips dip under curved crests, hence 9 vertices and a lift that grows with width. Winding flips with direction of travel, hence double-sided.
- **Bow wave:** tried as a second trail from the stem; removed after owner testing (it didn't add much).
- **Spray** (`vessel/view/spray.ts`): pooled particles, one draw call, sharing `render/particlePool.ts` with the smoke.
  - **Bow "moustache":** above 2.2 m/s.
  - **Slam bursts:** probes on both bows detect fast re-entry into the water (bow dropping into a wave).
  - **Drift:** particles keep the boat's velocity, then drag to still air, so they drift aft over the foredeck in a head sea.
  - **Night:** spray and smoke now darken at night.
- **Sound** (`audio/waterAudio.ts`): a water rush that rises with speed, and a splash burst on slams.
- **Haptics:** a light controller thud on slams.
- **Tunables:** `CONFIG.effects`.
- **Tests (100):** trail spacing and quads, no foam when stopped, foam by time with the prop churning, a strip break on a teleport.

## Done (cargo between ports; bow wave removed, owner request)

- **Bow wave removed:** it didn't add much. The stern wake and spray stay.
- **Cargo** (`src/cargo/`):
  - Items are plain data in `WorldState.cargo` (id, kind, mass, from, to, and where: a port stack slot or a vessel deck slot), with a deterministic spawn counter, so a host and its clients agree.
  - Every port keeps 3 waiting (`CONFIG.cargo.perPort`), coloured by destination.
- **Load and unload:** by intents (`cargoLoad` / `cargoUnload`, ref = cargo id), checked by the sim.
  - **Load:** alongside the port's cargo berth below 0.6 m/s, or at Selkie Bay (the anchorage) with the anchor set in the bay. It goes into a free deck slot (4) within the 5 t payload limit.
  - **Unload:** only at the destination, which counts as a delivery. A replacement then spawns at the emptiest port.
- **Real deadweight:** cargo aboard is passed to the physics as point masses. Total mass, the combined CG and the inertia (parallel axis) are recomputed every tick, and the strip hydrostatics find the new waterline by themselves. Tested: about 2.8 t aboard sinks her by roughly ΔW/(ρ·A_wp) at the LCF and trims her by the stern.
- **View:** one instanced mesh of boxes, sized by kind (crate, fish boxes, drums, sacks), with stacks on the quay, T-head and beach, and cargo riding in its deck slots.
- **Menu:** a new **Cargo** tab shows where you are, payload and deliveries, the cargo aboard (Unload) and the cargo waiting here (Load). If an action isn't possible, the menu says why (e.g. "Deliver to Brannock Pier"). Empty buttons are now hidden.
- **Fixes:** the Selkie Bay bothy had been sitting half in the water; it and the beach cargo are now on dry beach.
- **Not yet:** players walk through deck cargo (it isn't in the walk area); no pay or economy; cargo is moved by menu, not carried by hand.
- **Tests (106):** stocked ports, loading and the sinkage/trim check, refusal away from the berth or while moving, delivery only at the destination with a replacement, the anchorage needing the anchor, slot and payload limits.

## Done (cabin light, port lighting, docking, owner request)

- **Cabin light:**
  - A **CABIN** toggle on the console and a ceiling lamp whose diffuser glows when on.
  - It's one real PointLight (3 cd, 6 m reach). It always exists and is dimmed to 0 when off, so switching never changes the light count, which would recompile shaders and hitch.
- **Port lighting** (frame-rate friendly):
  - **Lamps:** posts on the quays, pier and T-head, plus one at the Selkie bothy. Their heads glow at night (one Points draw call).
  - **Floodlight:** ONE shared real PointLight, positioned at the floodlight of the nearest port within 500 m. It lights the quay and the boat while you dock.
  - **Water:** the ocean shader adds that light's soft pool and long glinting reflection.
  - **Cost:** 2 real lights in the scene in total.
- **Docking** (`vessel/physics/mooring.ts`):
  - Four berths (Calder Haven quay fuel/cargo, Brannock T-head fuel/cargo), each marked with a yellow strip on the edge.
  - **Hot spot:** within 18 m, under 1.5 m/s, and within 40° of the berth axis either way round. The sim notes it each tick, so the blue **DOCK** button lights.
  - **DOCK:** sends bow and stern lines ashore that come taut over 4 s (capped at 7 kN, so she warps in gently), then hold her as stiff, damped horizontal springs (capped at 40 kN). She still heaves and rolls. Dragged 8 m off, the lines part.
  - **Cast off:** DOCK again.
  - **Visuals:** the lines are drawn as ropes from the deck edge to bollards on the quay edge.
  - Also in the menu's Boat tab, with a status line.
- **Tests (111):** the hot-spot rules (close, slow, aligned, either way round), warping in onto the berth without a hard hit, holding against slow ahead while riding the swell, casting off, DOCK outside a hot spot, the cabin-light control.

## Done (meatier engine, more realistic water sounds, owner request)

- **Engine** (`audio/engineAudio.ts`, `audio/dieselWorklet.ts`): a small AudioWorklet, loaded from a Blob URL so it needs no extra files, synthesises the actual firing events of a 6-cylinder four-stroke at rpm/20 Hz.
  - **Combustion pulses:** each 5–9 ms long. Strength is fixed per cylinder (plus a little jitter), so the cycle is lumpy like a real engine, not a clean buzz.
  - **Injector clatter:** loudest at idle.
  - **Shaping:** a 45 Hz high-pass, exhaust-like resonances at 110 and 220 Hz, a low-pass that opens with rpm and load, and tanh saturation for grit.
  - **Extras:** a turbo whistle that spools up with load (lagged), a starter-motor whine while cranking, and intake/exhaust rush.
  - **Fallback:** the old oscillators where AudioWorklet is missing.
  - **Tuned for headset speakers,** which can't play the 30 Hz idle fundamental. Offline renders show idle energy now 60 % at 60–150 Hz and 22 % at 150–400 Hz (it was 52 % below 60 Hz). Peaks are 0.27 at idle and 0.5 flat out, with no clipping.
- **Water** (`audio/waterAudio.ts`):
  - **Continuous:** a whoosh (band-passed, rising with speed) and a bubbly fizz (high-passed). Both are modulated by a random walk plus a surge when the bow digs in, so the water breathes.
  - **Splash on bow slams:** three bursts — a low thud, a mid body, a long fizzy tail — randomised every time.
  - **Lapping:** short wet clops when smaller waves meet the bow, even at rest (at anchor or alongside). `Spray.update` now reports both slam and lap strengths.
- Both sound graphs build on any BaseAudioContext, so they are rendered offline (OfflineAudioContext in headless Chrome) to check levels and spectra.

## Done (engine voiced as a fishing boat, owner request)

- **Turbo whistle removed:** naturally aspirated.
- **Lumpier beat:** cylinder strengths 0.76–1.14 with ±12 % jitter.
- **Darker, rounder note:** the low-pass is at 190–890 Hz instead of 220–1440, with a resonant exhaust-stack "pop" (150 Hz, Q 2.2).
- **Less clatter and hiss.**
- **Rendered:** idle is 63 % at 60–150 Hz and 27 % at 150–400 Hz, with almost nothing above 400 Hz. No clipping.

## Done (searchlight, owner request)

- **Searchlight** on the wheelhouse roof (`vessel/view/searchlight.ts`).
  - **Housing:** a yoke and drum that pan and tilt with the controls.
  - **Light:** one real SpotLight (30 000 cd, 6° half-angle, 300 m). Kept at intensity 0 when off, so no recompiles.
  - **Beam:** a faint additive cone that shows at night.
  - **Water:** the ocean shader draws the bright pool and glints where the beam meets the sea, since the ocean doesn't receive scene lights.
- **Controls:**
  - A **SPOT** switch on the console.
  - A **joystick** (`controls/Joystick.ts`) on a pedestal to port of the wheel, mirroring the throttle's, so your left hand works the light and your right the throttle. It's a rate control: deflection² × 50°/s pan and 22°/s tilt. It springs to centre when released.
  - **Limits:** pan ±170°, tilt −35° to +12°.
  - **Intents:** pan and tilt are absolute values in degrees (`spotPan`, `spotTilt`, clamped by the vessel), like every control.
- **Controls API:** a new `Control.tick(dt)` hook for rate controls.
- **Tests (114):** pan rate at full deflection, forward raising the beam, no drift after release, the vessel clamping pan and tilt.

## Done (multiplayer v1: shared boat and avatars, branch `multiplayer`)

- **Peer-to-peer, one player hosts** (owner's choice), over WebRTC with PeerJS (approved, about 100 KB raw, 30 KB gzipped). The free public PeerJS broker only introduces the peers.
- **Host-authoritative:** the host runs `stepWorld` as in single player; clients send intents (stamped with their player id by the host) and render the host's 20 Hz snapshots 0.12 s behind, interpolated, with a smoothed estimate of the host's clock so the waves match.
- **Bodies are client-authoritative:** each player sends feet, head and hands at 20 Hz in the frame they stand in (vessel-local on deck), so crew-mates ride the boat exactly.
- **Avatars** (`net/avatarView.ts`): head with a visor, hands, body to the neck, one colour per player.
- **Menu:** a **Crew** tab with Host a game, a keypad for the 5-digit code, Join and Leave.
- **Leaving:** everyone carries on alone from the last state; if the host leaves, crew are told and continue solo.
- **Tests (121):** loopback host and client (welcome, intents, poses, snapshots, interpolation, disconnects), and the keypad. Checked in the browser with an in-memory loopback both ways: a crew avatar on the host's deck, a client following a host sim, the client's lever reaching the host, and falling back to solo when the host leaves. The real PeerJS connection can't be reached from the build sandbox; it needs testing on devices.
- **Design and limits:** [`docs/MULTIPLAYER.md`](docs/MULTIPLAYER.md).

## Done (control ownership and name tags, multiplayer)

- **Ownership:** `VesselState.holds` (channel → player). `hold` intents from the interaction system when a local hand or the mouse takes or releases a lever, the wheel or the joystick. The sim ignores other players' intents for a held control (the joystick's hold covers pan and tilt). Reaching for a held control glows red and bumps the controller; losing a simultaneous grab lets go with a bump. Leaving releases your holds.
- **Name tags:** a sprite over each avatar's head, edged in their colour. Names are picked in the Crew tab (a list, since typing in VR is awkward), remembered on the device, and sent with the pose so they can change mid-game.
- **Tests (124):** first hand keeps the lever, others ignored until release, can't release someone else's hold, joystick covers pan and tilt, switches stay shared, leaving releases.

## Done (off the boat: walking ashore, jumping, swimming; cargo by hand with lashing)

**Owner's choices:** ashore and into the sea; loose cargo slides unless lashed.

**Technical note (said to the owner):** the old cargo (0.6–1.4 t units) couldn't be carried by hand, so the kinds are now man-portable: crate 40 kg, fish box 30, sack 50, gas bottle 70, oil drum 110 kg; over 60 kg needs both hands. Real tonnage comes back with a deck crane or davit, an idea for later.

- **Body modes** (`player/body.ts`, `PlayerState.mode`):
  - **Walk:** on deck, ashore (`world/landWalkArea.ts`: quays and piers, terrain up to ~57° slope, wading to 1 m depth, the platform) or on the platform.
  - **Air:** a jump (A / Space) converts you to the world frame with the deck's velocity at your feet (v + ω×r) plus the jump. The first surface you cross wins: a deck (back into that vessel's frame), land, or the sea. The wheelhouse walls stop you (swept test, so long frames can't tunnel). Coming down on the bulwark puts you on the deck inboard. A quay face hit within 0.8 m of its top you clamber onto.
  - **Swim:** head 15 cm above the smoothed surface. Strokes are grab-the-world, the stick moves you at 0.8 m/s. Hulls push you clear. Stand up where it's shallow. Climb out by gripping the gunwale or transom (VR), or jump beside a hull or a quay face.
- **Cargo** (`cargo/cargo.ts`, `cargo/deck.ts`, `cargo/cargoHands.ts`):
  - **State:** items are ashore (world position), on a deck (vessel axes, sliding velocity, lashed) or carried by a player.
  - **Intents:** `cargoTake`, `cargoPlace` (args x, y, z, yaw), `cargoLash`. The sim checks each; placing snaps to the nearest free open-deck spot.
  - **Delivery:** set an item down ashore within 12 m of its destination's goods stack. Dropped in the sea: lost, and a replacement spawns.
  - **Deck dynamics:** apparent gravity at the item, g − a_P, with a_P from the finite difference of the deck-point velocity over the tick (heave, surge, roll and pitch accelerations, centripetal), in vessel axes. Coulomb friction μ 0.35. Disc contacts between items. Bulwarks and the wheelhouse stop items; over the rail beyond 0.55 g along the deck.
  - **Behaviour:** 90 s simulations with six loose items: moderate sea about 0.4 m of creep, storm beam-on about 0.8 m, none lost; a 25° heel slides everything to the low side, 40° puts it over.
  - **Payload:** deck items and items carried by players aboard. Four 110 kg drums stowed to starboard give about 1.5° of list.
  - **Hands:** VR grip to lift (two grips over 60 kg); the item follows the hand(s) upright; let go to place. Trigger to lash. Desktop: click to lift and to set down, Q to lash. While an intent is in flight, the item is drawn where your hands put it.
  - **Skiff:** at an anchorage (no quay), the menu's skiff moves goods between beach and deck.
  - **Visuals:** boxes and drums (one instanced draw call each), orange straps and ties to the D-rings when lashed, D-rings baked onto the deck. The item under your hand is drawn brighter.
- **Multiplayer:** carried items show in the carrier's avatar hands. A player who leaves sets down what they carried where they stood.
- **Tests (138):** jump keeps the boat's speed; landing on deck, quay and sea; swim height; wading out; pushed clear of the hull; climbing out at the gunwale and at a quay. Cargo: take, place, deliver, lose, carried and lashed items protected, heel thresholds, lashing range, list, skiff. Hands: one-hand and two-hand lifts, busy hands. Multiplayer: drop on disconnect.

## Done (teleport to port, owner request)

- **Go** next to each port in the Sea & time tab: a `teleportToPort` vessel intent (ref = port id) puts the boat at the port's cargo berth, ready to DOCK, or in the middle of its anchorage. It also sets the lever to neutral, stows the anchor and casts off the lines. If you're off the boat, you're boarded at the helm. In multiplayer, crew aboard ride along.
- **Tests (141):** for each port, she settles without jamming into the quay, and is in docking range (berths) or in the skiff's bay once anchored (Selkie).

## Done (pings, desktop searchlight steering, menu frame; owner requests)

- **Menu with motion decoupled:** the floating menu (and the VR sea-trials panel) now sits in the rig's carrier, the frame your view rides in through the comfort filter, instead of the vessel's frame. With coupling below 100 % it no longer rolls against your view.
- **Pings** (`player/ping.ts`, `player/pingView.ts`):
  - **Placing:** right stick click (VR) or right mouse button (desktop) drops a marker where you point. The ray hits boats, islands and quays, cargo, the platform, or the sea (marched to the wave surface).
  - **Shared:** pings are simulation state, one per player, gone after 10 s. On a boat a ping is stored in her frame and rides along.
  - **Look:** a thin light beam, a pulsing ring and a diamond that stays readable at range, in the player's colour, with a two-note chime that's quieter with distance.
  - **Player colours** now come from the player id, so avatar, name tag and ping match on every machine.
- **Desktop searchlight:** clicking the joystick puts it in keyboard steering. W A S D deflect it like a hand would (same rates), the mouse still looks around, walking pauses, and a click anywhere lets go. While steering it counts as held, so control ownership applies in multiplayer.
- **Tests (144):** ping replace and expiry, ping round trip over the network, desktop steering rate and release.

## Done (engine and water sound, owner request)

- **Engine less noisy:** the exhaust pulses are now smooth (1.5 ms rise instead of an instant step) and mostly tone (8 % noise instead of 40 %). Clatter is at 40 % of before, intake hiss at about a third, saturation is softer. Rendered: everything above 400 Hz is 8–14 dB down; the low thump is unchanged.
- **Wet exhaust:**
  - **Depth:** App works out how far the transom outlet is under the rendered sea surface, plus the water the hull raises at the transom, which the wave model leaves out: the stern wave near hull speed (Fn 0.28–0.45, up to 0.3 m) and water piling up going astern. Prop wash makes it come and go.
  - **How often:** it's under about 6–21 % of the time in moderate to stormy seas, often near full speed, and on and off going astern.
  - **Sound:** the dry exhaust path fades (down to 20 %), a low-passed (220 Hz) copy comes up, and a new worklet channel of exhaust bubbles burbles: 1–3 big bubbles (100–450 Hz) per firing beat, more under load. A little gurgle is always there while running (cooling water). It goes under fast and clears more slowly.
- **Water, third pass: Farnell's running-water model** (owner: the splash events still weren't right; asked to research and implement the best approach).
  - **Research:** Andy Farnell's *Designing Sound* (MIT Press 2010, practical 13 "Running water", and the SuperCollider port of it on Wikibooks) builds running water from a few continuous sine voices. Each voice's pitch keeps jumping to random cavity frequencies, glides up after each jump, and wobbles slowly. It only becomes water when several are layered. Up close water is that sine pattern; further off it blurs into filtered noise. The usual procedural sea is band-passed noise whose loudness and centre frequency swell at slightly different slow rates. Short decaying blips (both earlier versions) give crackle and plink instead.
  - **babble** (`audio/waterWorklet.ts`): 8 continuous sine voices spread across the stereo field.
    - Each jumps 8–118 times a second (with flow) to a random pitch in 220–700 Hz (gurgly) up to 480–2000 Hz (lighter, with speed). After each jump it glides up from about 75 % over about 30 ms, with a slow random wobble.
    - Each voice has its own slow gust envelope, so the babble comes in patches. More voices join as the flow grows.
    - It's a faint trickle at rest and a busy rush at 5 m/s.
  - **rush:** band-passed noise (250–850 Hz) whose loudness and colour swell at 0.21 and 0.29 Hz, surging when the bow digs in.
  - **Wave hits:** a soft, heavy double slap plus a gush (all voices jump fast and a little lower for about 0.35 s). Laps are a clop and a small gush. The fizz is only a hint.
  - **Rendered:** continuous (5–8 dB short-term variation, no crackle), energy in 150–1500 Hz, nothing above 6 kHz to speak of. Level about 0.06 at rest, 0.08 slow, 0.27 at speed with slams; no clipping.

## Water sound switched off (owner request)

The continuous "moving through water" sound (babble, rush, fizz) is off for now (`FLOW_SOUND = false` in `audio/waterAudio.ts`); the owner will come back to it. Only the hull impacts remain: a low thud when the bow slams and a short clop for laps. All three earlier approaches (bubble stream, splash events, Farnell's babble) are still in the history and code to build on.

## Rescues on cargo runs (owner request, in progress)

Plan agreed with the owner: five milestones, stopping after each for testing. Simplest thing that feels good in VR. Chart overhead (or wrist menu), VHF overhead, life ring, lockers and fenders as proposed, throw feel tuned with the owner.

### Milestone 1: rescue event and radio (done, awaiting owner test)

- **Cargo run** (`rescue/rescue.ts`): cargo aboard bound for another port, and the boat more than 300 m from every port. The destination is where most of the cargo aboard is going. The run starts from the last port the boat was in.
- **Trigger:** when a run starts, it rolls once (`CONFIG.rescue.chance`, 0.5) whether a call will come, and at what distance from the departure port (25–65 % of the way).
- **Incident:**
  - **Placement:** 450–800 m ahead toward the destination and 80–220 m to one side, in water at least 5 m deep and at least 350 m from any port. One at a time.
  - **Kinds:** in `rescue/rescueDefs.ts`, one person in the water, or 2–3 lost crates. Each has its radio text, its search radius and its closing message.
- **Radio** (`rescue/radioView.ts`, `controls/Handset.ts`, `audio/radioAudio.ts`):
  - **The set:** a VHF hung from the wheelhouse roof ahead of the helm to port, tilted down. It has a speaker grille, knobs, a red call lamp that flashes on an incoming distress call, and a screen with the latest message and a status line (cargo run, or the rescue that paused it). The screen redraws only when that text changes.
  - **Incoming call:** a two-tone alert, a crackle of static, then the message read out with the browser's speech synthesis where available (otherwise the text alone). The alert repeats every 10 s while unanswered. Each new message also shows as a notice.
- **Handset:** grab it off its clip (VR grip; desktop click) to answer.
  - **Reply:** "Thanks, skipper. Your cargo client has been told." It follows the cord about a metre and springs back to its clip.
  - **Ignoring it:** fine. The call times out after 2 minutes ("being assisted by another vessel").
- **Pause and resume:** while a rescue is accepted, the cargo run shows as paused (radio status line, Cargo tab). When the rescue ends, a closing message names the harbour to land them at and the run resumes. There are no deadlines, so nothing else needs pausing.
- **Shared state:** everything is plain data in `WorldState.rescue`, stepped by the host and shared with crew. Each client plays new radio traffic itself.
- **Debug (Tests tab):** **Call now** raises a call ahead of the boat, even without a cargo run. **End rescue** finishes the active rescue.
- **Tests (150):** a run starts on leaving harbour with cargo for another port; at chance 1 the call comes partway; the incident is ahead and off route, in open water; no call without cargo or at chance 0; the handset accepts, pauses and resumes; an unanswered call goes away.

### Milestone 1 follow-up

- The radio status said "No cargo run" until 300 m out of harbour. It now shows the cargo as soon as it's aboard: "Cargo for X: loaded, head out", and "set it down ashore" at the destination. Crates in the hands of players aboard count too.

### Milestone 2: search area and targets (done, awaiting owner test)

- **Chartplotter** (`nav/chartPlotter.ts`): hung from the roof beside the radio, ahead of the helm, tilted down. North up, centred on own ship.
  - **Zoom:** it keeps the search area in view while a rescue is on, else the cargo destination (ringed in yellow), else the nearest port.
  - **Contents:** land and shallows are drawn once from the terrain into a cached image (8 m/px). Ports, the search area as an orange dashed circle (the target itself is not shown), own ship and heading, a scale bar, and the bearing and range to the focus.
  - **Cost:** redraws at 2.5 Hz, only when the dash could be in view.
- **Targets** (`WorldState.rescue.active.targets`): placed when the call goes out, somewhere inside 60 % of the search radius (not at its centre). Crates float in a loose group 4–12 m apart. Everything drifts slowly (0.1, 0.06 m/s; there's no wind yet).
- **Target views** (`rescue/targetView.ts`): they ride the wave surface (sampled height and half the slope; no physics bodies).
  - **Survivor:** bright orange lifejacket with a reflective band, head above water, facing the boat. Waves an arm within 300 m.
  - **Crates:** bright orange, banded, with a reflective top patch, turning slowly.
  - **Visibility:** the orange is a little self-lit so it stays bright. At night (darkness above 0.25) a strobe flashes once a second: a glowing sprite, not a real light, sized to stay visible at range.
- **Whistle** (`audio/whistleAudio.ts`): instead of a synthesised shout (agreed in the plan), the survivor blows the lifejacket whistle every ~6 s within 350 m. Three trilling blasts (~3 kHz with a pea warble) through an HRTF panner at their position. The AudioContext listener follows the head while a rescue is on.
- **Debug (Tests tab):** **Alongside: Person / Crates** puts a target off the bow (now 18 m, within a ring's throw), already accepted. **On chart** shows the targets on the chart.
- **Tests (152):** targets inside the area but not at its centre, drift, debug spawn off the bow.

### Rubber-band hands for desktop players (owner request with M2)

- When a desktop player holds something with the mouse (wheel, throttle, joystick, handset, a carried crate), their hand reaches out to it on a stretchy arm and follows it.
  - **Grip points:** controls have a `grabPoint()`: the knob for levers and the joystick, the rim marker for the wheel (so the hand turns with it), the handset body. For cargo it's the top of the crate.
  - **Your own view:** a hand shoots out from just below-right of your view on a thin arm that stretches (`player/desktopHand.ts`), coloured in your player colour.
  - **Others:** a desktop player's hand goes out in their pose as the right hand. All avatars (VR too) now draw arms from the shoulders to their hands, thinner as they stretch. The hands snap quickly to a new grip.

### Milestone 3: recovery (done, awaiting owner test)

- **Simulation** (`rescue/recovery.ts`, shared state `rescue.ring` / `rescue.hook`, host-authoritative, anyone aboard can act):
  - **Life ring:** stowed on the wheelhouse aft wall → held → flying (ballistic) → in the water on a line from the starboard quarter cleat (max 30 m). A ring landing within 2.5 m of the survivor is grabbed.
  - **Line:** pulling shortens it; taut, it drags the ring (and survivor) toward the cleat. Reeled in with nobody on it, the ring goes back on its hook.
  - **Climbing aboard:** on the line within 3 m of the stern **in neutral**, the survivor climbs over the transom (2.2 s) and sits on deck (three seats aft). "Thank you! Thank you so much!"
  - **Propeller rule:** in gear with them within 7 m of the stern, they shout "Stop your propeller! Put her in neutral!" and swim away (paying out line) until you go to neutral. No failure.
  - **Boat hook** (port bulwark clips): touch a floating crate with the tip to hook it; it follows the tip. Within 2.5 m of the hull it can be lifted aboard: it becomes an ordinary 40 kg crate in your hands, bound for **any harbour**, coloured rescue orange. Set it down on deck as usual (lash it if you like).
  - **Recovered:** when nothing is left in the water: cheer and the radio thank-you. A crates-only rescue ends there; survivors stay aboard for M4 (landing).
- **VR** (`rescue/rescueHands.ts`): grip the ring, swing, let go to throw (hand speed × 1.4 relative to the boat; a gentle release hangs it back up). Grip the line at the cleat (or anywhere along it in reach) and pull hand over hand. Grip the hook; it points along the controller. With a crate on the hook, grip the crate with the other hand to lift it.
- **Desktop:** click the ring to take it, click again to throw: it lands where you look on the water (solved ballistic throw, up to the line length). Click the line or cleat to pull in 1.5 m. Click the hook to take it; click a crate in reach to hook it; look along the hull to tow it; click to lift it aboard (the hook goes back). Click open water to put the hook back. The desktop hand reaches for the ring / hook.
- **Views:** ring (orange and white), sagging line (a parabola by its slack, floating where it lies on the water), hook, survivor holding the ring (no waving), climbing over the stern, seated aboard. Other players' gear is drawn at their avatar hand.
- **Sounds** (`audio/rescueSounds.ts`): cheer (chime + crowd swell), survivor shouts by speech synthesis (higher, quicker voice) plus a notice, a knock-and-ding "snap" when anything is set down on deck.
- **Tunables:** `CONFIG.rescue` (throwScale, minThrowSpeed, catchRadius, maxLine, reelScale, desktopThrowSpeed, desktopPull, climbRange, climbTime, propRadius, swimAway, hookLength, hookReach, liftRange); gear positions in the vessel config `rescueGear`.
- **Tests (158):** throw/catch/reel/climb; missed ring reeled back and restowed; propeller rule; hook, tow and lift crates ends the rescue; only the hook holder can hook and tow; a desktop throw lands where you look.
- **Not yet:** landing survivors and crates at a harbour (M4).

### Milestone 3 follow-up (owner test: throw good, hook good; pulling unclear, no voice on Quest)

- **Line easier to find and pull (VR):** the rope is drawn as a 2.5 cm rope (it was a 1-pixel line, near invisible in the headset). It lights up yellow and the hand ticks when a free hand is in reach (at the cleat, or within 45 cm of the rope as drawn). A notice says how to pull when the ring lands.
- **Boat hook stays in hand:** grip once to take it; it stays in that hand. Grip again with it to put it down: back in its clips if you're at them, else laid on the deck (pick it up from there). Laid over the side, it goes back in the clips. New intent `hookDrop`.
- **Voice on Quest:** the Quest browser seems to have no speech voices, so nothing was heard. Now, with no voices (or if speech hasn't started within 1.2 s), the radio and the survivor use a synthesised voice-like babble (`audio/babble.ts`: a sawtooth through two vowel formant filters, syllable by syllable). The text is on the radio screen and in the notice. **Tests → Rescue → Voice test** plays a radio check and reports what the browser offers.
- **Tests (159).**

## Done (owner requests before milestone 4)

- **VHF and chartplotter moved** up under the roof into the forward corners (above the 3.15 m window head), turned toward the helm, so the windscreen is clear. `yawDeg` added to their config.
- **Sound settings** (menu → Sound): Master, Engine, Sea & effects, VHF & voices, FM radio, in 10 % steps, saved per browser (`audio/mixer.ts`). Every sound module now connects to a mixer bus instead of the speakers; speech synthesis and the FM radio take their volume from it.
- **Overhead switch panel** (`controls/overheadPanel.ts`), under the wheelhouse roof just ahead of and above the helm, above the windscreen sightline:
  - **FOREDECK / AFT DECK** floodlights: a lamp on each end of the roof aimed at the deck. Each is one real SpotLight kept at intensity 0 when off (no shader recompiles). Two more lights in the scene in total; check the frame rate on Quest at night.
  - **RAIL** lights: LED strips along the bulwark tops and across the transom, glow only (no real light).
  - **FM radio:** power switch, TUNE button (steps through the stations), and a display. It plays internet radio streams in a plain `<audio>` element (no CORS needed). The volume comes from the FM setting and fades with distance from the set (full within 3 m, silent at 16 m, and not streamed out of earshot). The tuned station is shared vessel state; each player's browser streams it. The display shows TUNING… or NO SIGNAL. The station list is in `CONFIG.fmRadio`: TruckersFM, Heart 90s, Absolute 90s (1.FM), Heart, Smooth and Radio Paradise (changed on owner feedback: pop and 90s, no German stations). The frequencies are made up. These streams could not be tested from the build machine (no internet there).
  - Menu → Sound has FM power and station buttons too.
- **Crew whiteboard** (`board/`): on the wheelhouse aft wall, port of the door, facing forward. Shared notes (`WorldState.board`, intents `noteAdd` / `noteMove` / `noteDelete`); the host's browser saves them, so they survive a reload. Up to 40 notes; a full board drops the oldest.
  - **VR:** point either controller at the board and pull the trigger. On empty board a QWERTZ keyboard panel opens (Shift, Space, ⌫, four note colours, Cancel / Post). On a note, hold the trigger and drag; let go off the board to take it down.
  - **Desktop:** click empty board and type in the browser's text box. Click a note to pick it up, then click again to put it down; off the board takes it down.
  - **Placement:** the board covers the port aft window. Its position is in the vessel config `whiteboard`.
- **Tests (164):** panel switches and FM tuning, whiteboard add/move/delete, full board, saved-board parsing.

### Follow-up (owner test)

- **FM too loud:** streams now play at `CONFIG.fmRadio.gain` = 0.2 of the setting (they're mastered loud); default FM setting 50 %.
- **VR crate lift didn't work:** the free hand had to be within 60 cm of the crate's centre at the waterline, out of reach from the deck. Now reaching over it is enough: within 1 m horizontally and above it, with the crate alongside. The hand ticks when it's in reach, and a notice says what to do when a hooked crate first comes alongside. Test added.

## Top speed raised to ~13 kn (owner request; still a displacement model)

- 13 kn on an 11 m waterline is Froude number ~0.64, well past hull speed (Fn 0.4, ~8 kn). With the old "wall" resistance curve that would have needed ~700 kW. Instead:
  - **Wave resistance** now levels off over the hump: R_wave/Δ = cap · tanh(w/cap) with `waveCap` 0.115, as for a transom-sterned workboat hull that can be driven past hull speed. Below ~9 kn it is within ~8 % of before. No planing lift is modelled.
  - **Engine** uprated 200 → 400 kW (torque curve doubled; friction, inertia and starter scaled). Cooling exchanger doubled; tank 600 → 900 L.
  - **Propeller** re-matched: pitch ratio ~1.15 (kt0 0.57, j0 1.15, kq0 0.077, jq0 1.25), so the engine runs at the governor's full-ahead point (~1700 rpm).
- **Trials now:** 25 % lever 6.8 kn / 12 L/h; 50 % 8.5 kn / 29 L/h; 75 % 10.2 kn / 54 L/h; full ahead 13.1 kn @ 1699 rpm, 83 L/h. 0 → 90 % in 7.5 s. Bollard pull 3.9 t. Astern 7.3 kn. Tactical diameter 2.2 L; crash stop 1.8 L.
  - Cruising at 8–9 kn is economical; the last knots cost fuel (range at full ahead ~140 nm).
- The speed bar on the dash now reads 0–15 kn. Tests updated (top speed 12.5–13.8 kn, bollard 3–5.5 t, fuel flat out 70–110 L/h).

## Rudder: a little more bite (owner request)

- Rudder blade 0.55 → 0.62 m². Steering is now **direct mechanical** (cable / chain, owner feedback): the rudder is where the wheel puts it, no steering-gear lag (`rudder.rateDegPerS: null`; a number gives hydraulic steering at that rate). The slipstream cap stays at 0.55 of thrust: above ~0.6 the hull starts spinning on the spot.
- New sea-trial measure **helm response**: time from hard over to 10° / 30° of heading change. Half ahead 2.8 → 1.9 s / 4.8 → 3.8 s; full ahead 2.0 → 1.2 s / 3.4 → 2.4 s (with the helm put hard over at once). Tactical diameter 2.2 → 2.1 L; steady turn unchanged.

## Engine sound retuned against a real recording (owner reference)

- The owner supplied a recording of a similar boat (a BBC-style library file, NHU10217724). It is **not** in the repo or the game, only used as a reference: its library licence most likely doesn't allow publishing it on a public site.
- **What it shows:** a six-cylinder at ~894 rpm (firing 44.7 Hz). Strong half-order lines at 67 / 112 / 156 Hz (cylinders unequal, alternating) and a 7.4 Hz once-per-cycle lope. A mechanical noise floor from ~200 Hz to 3 kHz, 15-20 dB under the rumble, falling with frequency. Almost nothing above 4 kHz.
- **Synth changes** (`dieselWorklet.ts`, `engineAudio.ts`):
  - Stronger alternating cylinder imbalance and longer pulse tails (a rumble, not separate thumps).
  - A new firing-modulated mechanical noise channel, 180 Hz - 4.5 kHz.
  - Softer 110/150 Hz body peaks, and a second high-pass at 36 Hz.
- **Result at 894 rpm:** 1/3-octave levels within ~3 dB of the recording from 40 Hz to 3 kHz; half-order lines within 2-5 dB.
- The new floor is mostly in the range small headset speakers can play, so the engine should carry better on the Quest. Offline render and analysis scripts were used to measure this.
- **Correction (water):** a closer look showed the 300 Hz - 8 kHz floor is mostly **water**, not engine. It isn't locked to the firing (only 0-3 % of its fluctuation is at 44.7 Hz), it swells slowly, and L/R are decorrelated. So the engine's mechanical layer is turned down (MECH 0.15) and the floor now comes from the water wash.

## Water sound back: hull wash voiced from the recording (owner request)

- The old flow sound (bubble "babble" worklet + band-passed rush + fizz) is gone (`waterWorklet.ts` deleted). It was dense popping, "frying in oil".
- **New wash** (`waterAudio.ts`): two decorrelated noise streams (stereo, diffuse like the recording), shaped to its measured spectrum:
  - Filters: high-pass 160 Hz, two first-order poles (380 Hz, 1.5 kHz), a small fizz peak at 4.8 kHz, low-pass 10 kHz.
  - Slow random swells (two Ornstein-Uhlenbeck processes, corners ~0.3 Hz and ~1.3 Hz, ~30 % depth), brighter as it swells; the hull's real wave hits (lap, slam) add surges.
  - Level ~speed^1.5, a trickle at rest, brighter with speed.
- **Matched against the recording** (engine + water at 894 rpm and ~7 kn):
  - 1/3-octave levels within ~2 dB from 315 Hz to 4 kHz.
  - Swell rhythm (most energy at 0.25-0.5 Hz), swell depth 0.26 / 0.33 / 0.39 (recording 0.27 / 0.32 / 0.37).
  - Burstiness p99/median 2.0-2.4 (2.1-2.5); L/R correlation ~0.1.
- The hull impacts stay: low thud on a slam (now also surging the wash) and the wet clop for laps.

## Engine: tinny "lawnmower" part removed (owner feedback)

- Removed the injector clatter channel (~3 kHz ticks) and the firing-modulated mechanical noise channel (both periodic buzz in the upper range). The worklet now has 2 channels: pulses and exhaust bubbles.
- The distortion's low-pass now tops out at ~450 Hz (was ~900); soft clip 1.6 -> 1.25.
- Engine alone is now 50-65 dB down above 600 Hz at cruise (was -33 to -44). Engine + water still matches the recording within ~2 dB to 4 kHz: the upper range is the water, as in the real boat.

### Water and engine balance (owner feedback)

- The wash was far too loud in the game (the offline match had engine and water at equal level; in the game the engine is attenuated and on an 80 % bus): water was ~2 dB *over* the engine at the helm. Now ~18 dB under (`WASH` 0.1).
- It sounded like wind: the smooth top end is gone (no fizz, low-pass 2.5 kHz, smaller brightness swings).
- The "thick water globs" were the engine's exhaust bubbles, always on (and on the engine bus, so turning the engine up made them louder). Now only when the outlet is actually under water. The lap clop is quieter too.
- Sound page: **Reset to defaults** button.

### Milestone 4: landing and finishing (done, awaiting owner test)

- **Landing survivors** (`rescue.ts`, shared simulation): once everyone is recovered, survivors sit aboard until she is **moored alongside any quay** (DOCK). (Anchorage landing by the port skiff was removed in skiff S3.)
  - They get up one every 1.4 s, step across in 2 s (a hop over the rail), and stand ashore 1.6 m in from the quay edge, 0.9 m apart, waving at the boat.
  - Then: the coastguard thanks you on the VHF (and says to carry on with the cargo), a cheer, rescue count +1. After 12 s the rescue closes.
  - The radio's closing message still names the nearest harbour, but any harbour counts (no penalty).
- **Recovered crates** (to "any harbour") are delivered at any port: set down in its goods area, or taken off by the skiff at an anchorage.
- **Cargo resumes:** while survivors are aboard the chart shows the nearest harbour. After landing it goes back to the destination, and that cargo won't trigger a second distress call on the same trip (`quietTo`).
- **Rescue count:** kept in the host's browser (localStorage `swvr.rescues`), shown in the menu's Cargo tab ("Rescues: N completed").
- **Views:** standing survivors get legs; getting up, stepping across and waving on the quay are animated (`targetView.ts`).
- **Debug:** Tests → Alongside → **Aboard** puts a survivor on deck, to try landing.
- **Tests (170):** quay landing (aboard at sea → moored → landing → ashore → thanks → closes); skiff landing at an anchorage; crates delivered anywhere; no second call on the same cargo trip.

## The skiff (owner request): a launchable tender with an electric outboard

Plan in three milestones: **S1** the skiff itself, **S2** the stern davit (one-click launch / recover, charging), **S3** cargo (2 crates or 1 barrel) and beach work; the invisible port skiff at Selkie goes. Owner decisions: remove the port skiff; hang the skiff high on the davit so the transom stays clear for survivors; ~5-6 kn.

### S1: the skiff (done, awaiting owner test)

- **Vessel types are now modular** (`vesselDef.ts`): every boat has a hull, mass properties, resistance, a deck layout and a cargo deck, plus EITHER an inboard drive (diesel, shaft, propeller, rudder) OR an outboard.
  - Workboat-only equipment is optional: bridge, lights, anchor, mooring lines, rescue gear, panel, whiteboard, searchlight. So are the wheelhouse, roof and ladder.
  - `WorkboatDef` / `asWorkboat()` mark code that needs a fully equipped boat. The rest (physics, walk areas, hull mesh, effects, cargo) works on any boat.
- **The skiff** (`CONFIG.vessels.skiff`): 3.6 m x 1.6 m flat-decked aluminium skiff (a punt with a low coaming), 330 kg with motor and battery. Floats level on her DWL, GM 1.6 m.
- **Electric outboard** (`physics/outboard.ts`): 750 N static thrust, falling with speed of advance, astern 55 %. Steered by swinging the whole motor (30 deg), so there's no steering without throttle. 3 kW from a 2 kWh battery (draw ~ throttle^1.5).
  - Trials: **5.5 kn** flat out for ~40 min (3.7 nm), 3.9 kn at quarter throttle for ~20 nm. 0 -> 90 % in 2 s; tactical diameter 2.4 L; 10 deg of heading in 0.9 s.
- **Boat against boat** (`physics/vesselContact.ts`): each hull's deck edges and chines are tested against the other hull. A soft fender-like spring-damper pushes both apart, so the skiff bumps off the workboat (in by < 15 cm at full throttle) instead of passing through.
- **Tiller** (`controls/Tiller.ts`), with the motor it swings and a 5-bar battery gauge on the cowl:
  - VR: grab the handle, swing it sideways to steer (tiller to port = bow to starboard). Twist the grip for throttle: clockwise seen from behind it is ahead. It stays where you leave it.
  - Desktop: click the tiller; W/S throttle, A/D swing (springs back), mouse looks around; click again to let go.
  - Its intents go to the skiff (channels `<vesselId>:helm` / `:lever`; the App routes them).
- **Driving keys** steer the boat you're standing in. Menu → Boat → **Board the skiff**, and its battery %. You can also jump or swim across.
- **Sound:** a quiet electric whine that rises with throttle; the water wash follows the boat you're in.
- The game's world has the skiff on the workboat's stern davit (S2). Test worlds only get it when asked (`createWorld(..., { tender: true })`).
- **Tests (182):** skiff trials (speed, battery, turning, motions), drives / drains / steers, no battery no thrust, bumps off the workboat.

### S1 follow-up: gear lever, motor switch, propeller sound (owner feedback)

Owner: in VR the controller drops out of tracking when you look ahead, the twist grip jumped and she went astern.
- **Gear lever** on the motor's side (`controls/GearSelector.ts`): FORWARD (push toward the bow, green end) / NEUTRAL / REVERSE (pull aft, red end), with detents and a haptic click. Shifting closes the throttle (`obGear` intent).
- **On/off button** (red, on top of the cowl, aft of the battery bars). The motor starts OFF and in NEUTRAL; no thrust unless it is on and in gear (`obPower`, `controls.obOn`).
- **Twist grip** now sets only how much throttle (0..1); the direction is the gear lever's, so a tracking glitch can't put her astern. A twist jump of more than 40 degrees in one frame is ignored as a glitch.
- **Desktop:** click the tiller, W / S as before (through neutral, which shifts the gear for you); the hint shows "motor OFF" or the gear. The debug driving keys switch the motor on and shift for you.
- **Sound:** the whine is lower, softer (triangle through a lowpass) and about 8 dB down. New **propeller churn**: band-limited noise beating at the blade rate (3 blades, ~75 Hz flat out), louder and rougher astern.
- **Tests (183):** motor off and neutral give no thrust; shifting closes the throttle; reverse goes astern.

### Trigger throttle and crouch (owner feedback)

- **The twist grip is gone** (still hard to use in VR). Grip the tiller to take control and steer by swinging it; the **trigger of that hand is the throttle**: squeeze for more, ease off for less, let go to idle (a dead-man, like a jet-ski trigger). Letting go of the tiller closes it too. The gear lever still sets the direction. Hand jumps of more than 25 cm in a frame (tracking loss) don't move the tiller.
- **Crouch:** X in VR (it used to be hold X + stick for motion coupling, which is in the menu), C on the desktop while walking. The view and hands drop 0.6 m (`CONFIG.locomotion.crouchDrop`); standing up is the same button. Jumping or swimming stands you up.
- **Tests (186):** trigger throttle, easing off idles, letting go closes it, tracking jumps ignored.

### S2: the stern davit (done, awaiting owner test)

- **Davit** (`CONFIG.vessels.workboat.davit`, `vessel/davit.ts`, `controls/DavitGear.ts`): two arms on the quarters reaching aft over the transom. The skiff hangs athwartships from them, keel above the rail, so the transom stays clear for survivors.
- **On the davit she rides the ship** (kinematic, like the crew on deck): her pose is the ship's pose times a point in the ship's axes, no floating physics and no boat-against-boat contact. No wake or spray while she hangs.
- **One click** (green button on the starboard davit post, or Menu > Boat > Skiff):
  - **LAUNCH**: lowered on the falls over 7 s (eased), then let go at the water with the velocity the ship gave her. Crew aboard ride down with her.
  - **RECOVER**: only when she is within 3 m of the spot under the davit and moving within 1.2 m/s of the ship; the button and menu say why not ("too far" / "too fast"). The motor is switched off, she is lined up under the arms (2.5 s), then hoisted (7 s). Anyone still in her steps off onto the aft deck.
- **Charging:** on the davit the battery charges from the ship, flat to full in 5 min (`chargeMinutes`).
- The game starts with the skiff stowed on the davit. Moving her anywhere (`placeVessel`) puts her afloat.
- **Tests (189):** hangs at the davit point riding with the boat; charges; launch ends afloat; recover refused far away, accepted under the stern; crew step off.

### S3: cargo in the skiff, beach work (done, awaiting owner test)

- **Load limits** (`cargo.slots`, `CONFIG.cargo.kinds[].slots`): the skiff takes two crates (or fish boxes, sacks, gas bottles), or one oil drum (2 slots), within her 250 kg payload. Trying to set down one more says "She's full: two crates or one drum at a time" and it stays in your hands (VR: grip it again to put it somewhere else). The payload limit is now checked for every boat when cargo is set down.
- **Cargo space** (`cargo.bowClear` / `aftClear`): in her bottom between the bow and the helmsman's place by the tiller. It sits wedged in and doesn't slide (`cargo.fixed`).
- Cargo can go in while she hangs on the davit (it rides up and down with her). When you set something down over the stern, it goes to whichever deck is nearest below your hands.
- **Beach delivery at Selkie:** anchor in the bay, launch, load, and run her up the beach. She grounds about 5 m from the goods stack, well inside the delivery radius. Step ashore and carry the goods up.
- **Fix: light boats aground.** The seabed and shore contact springs were tuned for the 18 t workboat, and the 330 kg skiff blew up numerically on the beach. The contact forces now scale with the boat's mass (`contacts.referenceMass`), so k/m and c/m are the same for every boat.
- **The invisible port skiff is gone:** no more `cargoLoad` / `cargoUnload` or menu "Skiff out / ashore". `skiffPortAt` is now `anchoredAt`. The Cargo tab lists what's on deck and what's in the skiff (slots, kg).
- **Survivors are landed only at a quay** (an anchorage has no quay).
- **Tests (191):** two crates / one drum; full skiff refuses (you keep it); cargo stays put and clear of the tiller; Selkie beach run, ground and deliver; anchorages don't land survivors.

### Anchor fix and indicator (owner bug report)

Owner: after raising the anchor at Selkie, motoring out of the bay hit "an invisible wall", as if the anchor were still down.
- **Bug** (`physics/anchor.ts`): once broken out, the anchor hangs under the bow while the last of the chain comes in. If the boat moved into water shallower than the chain still out, the code took it as on the bottom again: it set where it was and held the boat. Being no longer "weighing", it also stopped heaving in, so it never came up. Now a broken-out anchor stays off the bottom until it's stowed.
- **Faster windlass:** heave-in 0.35 → 0.6 m/s (46 m of chain in Selkie Bay in about 80 s instead of 2+ min).
- **Indicator** on the speed screen: ANCHOR UP (dim), ANCHOR DOWN 46 m (amber), LETTING GO / HEAVING IN n m (flashing), DRAGGING (flashing red). Pop-ups "Anchor holding: n m of chain out" and "Anchor up and stowed".
- Run status for survivors now says "dock alongside a quay" (anchorages no longer land them, S3).
- **Tests (193):** weighed while motoring off, it comes home and lets her go; a broken-out anchor doesn't set again in shallow water.

### Walk-around side decks (owner request)

Owner: hard to walk past the wheelhouse to the bow; keep the wheelhouse as it is.
- **Before:** deck 4.2 m wide, parallel only to 45 % of the length. Beside the wheelhouse (2.9 m wide) that left ~0.55 m aft, closing to nothing at its front corners where the bow fines. The walkable band was blocked there.
- **Now:** deck 4.6 m (`hull.beamDeck`), parallel body carried forward to 62 % of the length (new `hull.deckParallel`; the skiff keeps 0.45). The side decks are 0.73-0.77 m clear from the wheelhouse side to the bulwark, all the way from the aft deck to the foredeck. The chine is unchanged, so the waterline and the underwater hull barely move: the extra width is flare.
- **Hydrostatics:** same displacement (18.3 t, sinkage -5 mm, level). GM 1.19 → 1.31 m, max GZ 0.47 → 0.58 m at 40°. Roll gyradius 1.68 → 1.8 m (0.4 B). Speed, turning and motion trials are unchanged within their limits.
- Moved out with the bulwarks: the boat hook clips (x -1.92) and the side D-rings (x ±1.95).
- **Tests (194):** both side decks walkable along the whole wheelhouse, at least 0.25 m of walkable band (fails on the old hull).

### Optimisation pass (owner request)

**Measured first** (headless Chromium with software GL; scripts in the scratchpad `perf/`):
- **CPU (views + simulation), GPU render stubbed:** 0.54 ms per frame here, so roughly 2 ms on a Quest 3. One sim tick is 0.24 ms.
- **Garbage:** about 0.4 KB per frame, too little to cause collector hitches.
- **Scene:** 41-73 draw calls and about 160k triangles (ocean 85k, terrain 39k, trees 20k), no shadows, 15 shader programs, Lambert materials throughout.

**The costs found were on the GPU and in uploads:**
1. **Switched-off lights cost on every pixel.** Five real lights (deck floodlights ×2, searchlight, cabin lamp, port floodlight) were kept at intensity 0 when off, to avoid shader recompiles. A zero-intensity light is still evaluated per pixel in every lit material, so in daylight every Lambert surface paid for 3 spot lights and 2 point lights doing nothing.
   - **Fix:** an off light is now hidden, which drops it from the shaders. Switching it costs one recompile (a brief hitch). The port floodlight joins at dusk and leaves at dawn.
   - **Result:** by day, 2 lights instead of 7.
2. **Ocean shader:** the port-light and searchlight terms (lengths, normalises, two `pow`s) ran on every sea pixel, day and night. They are now behind uniform branches that skip them while those lights are off.
3. **Instrument atlas** (1024×768, about 3 MB):
   - Before: it was re-uploaded at the full 10 Hz whenever the dash was in view.
   - Now: it repaints only when something shown changes, keyed on the values rounded to what you could see change.
   - The echo sounder now reads from the still waterline (no heave jitter), and the tacho digits read in tens.
   - **Result:** idling at the helm, 22 uploads per 10 s instead of 90 (about 6.6 MB/s less).

**Not changed:**
- XR resolution (framebuffer scale 1.0).
- Foveation (0.5). Raising it to 1.0 is the next cheap fill-rate lever if the Quest still struggles.
- Triangle counts are within budget.

### Sea surface detail: wind ripples (owner feedback)

Owner: a completely calm sea is hard to see. In a flat calm every facet normal is straight up, so the water was one even colour: nothing for the eye to focus on, hard to judge distance or where the surface is in VR.
- **Ripples** (`ocean/rippleTexture.ts`, `CONFIG.ocean.ripples`):
  - A 256² tiling slope texture built at start-up: 28 sine ripples with whole cycles per tile (seamless), a wind-ripple spectrum, spread around one direction. No download.
  - The ocean shader samples it twice: a 9 m layer and a 3.1 m layer drifting in different directions (0.35 and 0.22 m/s). It tilts the facet normal, so the sky reflection and sun glitter break up.
  - Shading only: the water and the boats don't move with them.
- Faded out between 30 and 260 m, where they'd only shimmer; mipmapped.
- Slightly stronger in a flat calm (`calmBoost`, fading as the waves reach ~0.3 m), where they're the only texture there is.
- **Cost:** two mipmapped texture reads per sea pixel within 260 m.

## Duty board, electrics, weather, logbook and chart table (owner brief, 10 milestones)

Owner decisions:
- **The crew whiteboard stays as it is.** Game tasks go on a new **duty board**.
- **Placement:** chart table on the port side aft. Duty board on the starboard side. Breakers and voltmeter by the helm. Master switch and battery selector low on the aft wall by the door.
- **Ignition:** key ON/OFF plus HEAT and START buttons (not a twist key).
- **Pencil marks** drawn as line geometry, not a canvas texture.
- **Rain glass** shown only in rain. Radar redraws per sweep (or AIS targets on the plotter instead: to decide at milestone 5).
- **Wind leeway** acts on the skiff too.
- **The game starts cold.** Quick start (off) and "power on" are debug options.

### E1: electrical spine (done, awaiting owner test)

- **State** (`vessel/electrics.ts`, `VesselState.electrics`, `CONFIG.vessels.workboat.electrics`):
  - Two batteries (charge 0..1, 100 Ah), the selector (1 / 2 / both; on 1 until milestone 3), and the battery master.
  - The last tick's bus voltage and current.
- **Model:**
  - Loads draw a fixed current while on: instruments, chart, VHF, FM, nav lights, deck floods, rail LEDs, cabin lamp, searchlight, horn, windlass, and the starter (180 A).
  - The alternator gives up to 60 A while the engine runs.
  - Resting voltage follows the charge (11.8 → 12.7 V). It sags by I·R under load (cranking dips it to about 10.5 V) and rises toward 14.2 V on charge.
  - Below 2 % a battery is flat.
- **`isPowered()`** means master on and the selected battery not flat. Without it:
  - Dash displays, chart plotter, VHF screen and FM display go black (each drawn once).
  - Nav lights, deck floods, rail LEDs, cabin lamp and searchlight are off.
  - Horn, FM and VHF are silent. Calls ring out unheard and the handset can't answer.
  - The windlass doesn't move the chain.
  - The starter won't turn. A running engine stops (fuel solenoid). A weak battery cranks slowly (starter torque scales with the voltage).
- **Master switch:** a red key on a yellow "BATTERY MASTER" plate, low on the aft wall starboard of the door. Press to turn it a quarter turn: OFF across, ON up.
- **Voltmeter:** an 8-16 V dial, printed once, with a moving needle (no texture uploads). It sits on a small sloping console under the starboard window sill by the helm, where the breakers go in milestone 2. It reads the bus, so 0 with the master off.
- **Game starts cold:** master off, dark bridge (`createWorld(..., { cold: true })`). Tests and sea trials start warm.
- **Menu → Tests → Electrics:** status (master, volts, battery charges), Power on, Fill, Flat.
- **Tests (201):** cold start won't crank; master on gives power, cranking dips the volts, the alternator lifts them; loads drain and running charges; master off stops the engine; a flat battery gives no power; the windlass needs power; trials start warm.

### E2: breaker panel (done, awaiting owner test)

Owner decision: **no radar screen.** Passing vessels will show as AIS targets (triangles) on the chart plotter when they arrive (milestone 8).

- **Breakers** (`ElectricsState.breakers`, `BREAKERS`): Instruments, Chart, Radio, Nav lights, Deck lights, Bilge pump. `isPowered(s, breaker)` means master on, battery not flat, and that breaker on. What each one feeds:
  - **Instruments:** the dash displays.
  - **Chart:** the chart plotter.
  - **Radio:** the VHF (screen, speaker, handset) and FM.
  - **Nav lights:** the nav lights.
  - **Deck lights:** floods, rail LEDs, cabin lamp and searchlight.
  - **Bilge:** draw only (3 A).
  - The starter, fuel solenoid, horn and windlass are on the master alone.
- **Power draw:** a load counts only with its breaker on (instruments 2.5 A, chart 2 A, VHF 1.5 A + FM 1 A, ...). The alternator charges while running, so you can watch the voltmeter drift.
- **Panel:** six toggles in two rows next to the voltmeter, each with a green lamp lit while its circuit is live. Lamps change colour only on change, and the labels are drawn once. Intents `brk_<name>` 1 / 0.
- **The cold boat has every breaker off.** Menu → Tests → Electrics → "Power on" switches the master and all breakers on. The status line now shows amps too.
- **Tests (203):** circuits are independent; a device needs master AND breaker; each breaker adds its draw; master off kills them all; cold breakers are off; "power on".

### E3: engine start procedure, duty board (done, awaiting owner test)

- **Diesel ignition** (`propulsion.ts` `stepIgnition`, `EngineState.key/glow`, controls `heat`/`start`). On the console, starboard of the throttle:
  - **HEAT** (orange, hold), **START** (green, hold) and the **key** (press: off ↔ on).
  - The key off (or no 12 V) closes the fuel solenoid: she stops.
  - HEAT with the key on heats the glow plugs (`preheatTime` 4 s, 35 A); they cool again when let go.
  - START with the key on and the lever in neutral cranks (neutral-safety switch). Let go before she catches and the starter stops.
  - **Cold and unheated**, she needs up to 5 s more cranking (`unheatedExtraCrank`).
  - **START in gear:** nothing happens, the NEUTRAL lamp blinks, and a hint says why.
- **Warning lamps** (Instruments breaker), in front of the ignition:
  - **OIL, CHARGE:** red until she runs.
  - **GLOW:** orange while heating, until the plugs are hot.
  - **NEUTRAL:** green with the lever in neutral.
  - One instanced draw call; colours change only on change.
- **Battery selector** (1 / BOTH / 2, a press steps it) beside the master on the aft wall. **Debug:** Menu → Tests → Start-up → "Battery 1 flat", then recover on battery 2.
- **Start-up card:** a laminated card on the console by the key, drawn once.
- **Quick start** (`electrics.quickStart`, default off): the desktop E key does it all; otherwise E explains the procedure, and stops her (key off) if she's running. Menu → Tests → Start-up → "Quick start" always works. The old START/STOP toggle is now this quick start (tests and trials still use it).
- **Duty board** (`duties/duties.ts`, `duties/dutyBoardView.ts`, `WorldState.duties`):
  - A green board on the starboard wall, aft half of the side window. One canvas, redrawn only on change.
  - **DUTIES:** game tasks with steps that tick themselves off. Finished duties linger 15 s, then drop off; there's a tick sound when one finishes.
  - **SHIPPING FORECAST:** "No forecast received" until milestone 5.
  - The crew whiteboard is untouched.
- **Start-up duty:** up while the boat is cold (engine off, coolant < 40 °C). Steps: master, INSTR, neutral, key + HEAT, START, then CHART/RADIO/NAV as needed (optional). Done when she runs.
- **Profile (milestone 3)**, headless, CPU only:
  - 0.63 ms per frame (views + sim); one sim tick 0.16 ms.
  - Draw calls: 42 at the helm, 88 from the aft deck looking forward (110 before merging each toggle's lever into one mesh and instancing the lamps).
  - Triangles unchanged (~160k).
- **Tests (211):** start from cold by the card, with the duty ticking off; no key / START in gear does nothing; letting go of START stops cranking; cold and unheated cranks long, preheated catches fast; key off stops her; battery 1 flat → selector 2 starts her; the selector steps; quick start.

### E4: weather (done, awaiting owner test)

- **Weather state** (`environment/weather.ts`, `EnvironmentState.weather`, synced in snapshots like the rest of the world):
  - Five presets in config: **Clear, Overcast, Fog, Rain, Squall**, each a wind speed, visibility, rain and cloud cover.
  - A **director** holds each preset for 4–10 min (squalls 1.5–2.5 min), then picks the next from an allowed list: never clear straight to a squall, a squall always eases to rain.
  - Changes **ease over a minute**; the wind direction wanders ±35° around the south-west.
- **Sea follows the wind, with a lag:** Hs target = `seaPerWind` × wind; it builds over ~90 s and decays over ~160 s. The waves are rebuilt once a second with their phases carried over, so the surface never jumps.
- **Fog and visibility:** Three's built-in scene fog only (no new passes), from 12 % of the visibility out to the visibility. Cloud greys the sky and dims the sun. Two **fog banks** sit by Gull Rocks and off the Skerry: visibility drops as you sail into them.
- **Leeway** (`vessel/physics/windage.ts`): one horizontal drag force, ½ρ·Cd·A·|u|u per axis on the apparent wind, using side and end areas from the vessel config.
  - It acts at a **centre of effort** that sits over the hull's centre of lateral resistance with the wind on the beam, and moves toward the upwind end as the wind comes ahead or astern (like a flat plate). So a stopped boat **swings beam-on and lies there**, as real ones do.
  - In a squall (17 m/s) in flat water: workboat ~0.6 m/s (1.2 kn), skiff ~1.1 m/s. Under way you'll feel her pushed off and need a little helm.
- **Drift:** people and things in the water drift downwind (2 % of the wind on top of the current). The thrown life ring is pushed downwind in flight.
- **Wind sock** on the wheelhouse roof: striped, swings to the apparent wind, droops in a calm.
- **Wind noise:** filtered noise with gusts, muffled inside the wheelhouse, rising with the wind.
- **Controls:** **L** steps to the next preset.
  - **Menu → Sea & time → Weather:** shows now / next (preset, wind as compass point and Beaufort, visibility, Hs, minutes to the next change), the preset buttons, **Fixed weather** and **Fast ×10**.
  - The debug "force any weather preset" and "speed up transitions" options are these.
- **Tests (218):**
  - the start preset;
  - the director only makes allowed changes;
  - smooth transitions, with the sea lagging the wind;
  - the wave surface stays continuous through a rebuild;
  - fog and fog-bank visibility;
  - leeway: beam-on, a realistic speed, the skiff faster;
  - things in the water drift downwind.

### E5: rain, squalls and crew work (done, awaiting owner test)

- **Rain streaks** (`environment/rainView.ts`): the one new visual effect, capped.
  - Line segments in a 16 × 8 m box around the viewer: 1400 on high, 500 on low (Menu → Sea & time → Rain effect, remembered on the device).
  - **One draw call**; how many are drawn follows the rain.
  - All motion is in the vertex shader (falling, leaning with half the wind, wrapping round the viewer), so there's no per-frame CPU work or upload.
  - None fall inside the wheelhouse (a box in the boat's frame) or below the sea.
- **Window rain and wipers** (`vessel/view/rainGlass.ts`): a wet-glass plane on the three front panes, shown only while it rains.
  - Drops are hashed cells whose share rises with the rain and with the time since that spot was wiped.
  - Three pendulum wipers hang from the window head. The shader works out when the arm last passed a point from the wiper's clock (a triangle wave), so nothing is painted or uploaded.
  - **WIPERS** switch on the console (port end). The wipers draw 4 A on the Instruments breaker; switched off they park.
- **Squalls:** rain darkens the light beyond cloud cover.
  - Lightning every 10–30 s at 0.5–4 km (`WeatherState.lightning`, host-chosen and synced). The view flashes the sky and sky light for a third of a second.
  - Thunder follows at 343 m/s: a crack if close, then a rumble.
  - Rain sound: a hiss outside, a drum on the roof inside.
- **Shipping forecast** (`environment/forecast.ts`):
  - The coastguard reads the director's plan every 6 min and 30 s after each change.
  - Wording is shipping-forecast style: Beaufort, compass, fair / cloudy / fog patches / rain / squally showers, and visibility good / moderate / poor / very poor. "Gale warning" comes with squalls.
  - **Heard only with the radio on.** It is then `WorldState.forecast`, read out on the VHF and shown on the duty board with its time.
- **Forepeak hatch and bilge** (`controls/Hatch.ts`, `vessel/bilge.ts`):
  - The hatch is on the foredeck and starts open. Open in rain, the bilge fills (full in about 7 min of steady rain, double in a squall).
  - The pump on the BILGE breaker has a float switch and only runs, and draws current, with water in the bilge.
  - A **BILGE** warning lamp (5th) blinks above 30 %. There are no physics effects: it's state the crew has to look after.
- **New duties** (duty board):
  - **Rain/Squall (coming): secure the boat.** Comes from a received forecast of rain or a squall, or the weather itself. Steps: close the hatch, lash cargo, wipers (optional). It drops if fair weather returns first.
  - **Restricted visibility.** Under way in visibility below 1000 m. Steps: nav lights; a prolonged blast (≥ 4 s, timed from the horn) that un-ticks after 2 min; safe speed (optional). It stays up until the visibility is over 1500 m, then counts as done if the signal was kept.
  - **Bilge alarm.** Steps: BILGE breaker, pumped dry.
- **Spotting:** survivors wave only within the visibility. Their strobe (which ignores fog) is cut beyond 1.6 × the visibility; the whistle still carries. The **lookout** calls out each floating target once, as it comes within min(900 m, visibility), with a clock bearing and range.
- **Debug:** Menu → Tests → Bilge: level, hatch and pump, and **Flood (60 %)**. Rain effect High / Low / None. With the E4 options, this covers the brief's power, battery, weather-preset, transition-speed and rain-quality debug options. Spawn passing vessel and clear chart marks come with M8 and M7.
- **Profile (milestone 5),** headless with SwiftShader, CPU only. Worst case: a squall at full rain on high quality, wipers going, engine running.

  | | M3 | M5 |
  |---|---|---|
  | Draw calls at the helm | 42 | 48 |
  | Draw calls, aft deck looking forward | 88 | 96 |
  | View CPU per frame | 0.76 ms | 1.2 ms |
  | Sim tick | 0.16 ms | 0.19 ms |
  | Triangles | ~160k | ~160k |

  The extra draw calls are the rain, the wet glass, the instanced wipers and the M4 wind sock. The wet glass is the costliest new pixel work at the helm: it covers the windscreen with a small hash shader. If the Quest struggles, try Rain effect Low / None first.
- **Tests (226):**
  - the forecast is heard only with the radio on, says what's coming and when, and is repeated on schedule;
  - a forecast follows a change, with a gale warning in a squall;
  - lightning comes only in squalls;
  - an open hatch in the rain fills the bilge, and the pump empties it with its float switch;
  - the bilge, secure and fog-signal duties (including the blast un-ticking after 2 min and done on clearing);
  - the wipers' load.

### E6: chart table and logbook (done, awaiting owner test)

- **Chart table** (`vessel/view/chartTable.ts`, config `workboat.chartTable`): along the port wall, aft half, 0.65 × 1.32 m, top 0.95 m above the floor.
  - It's solid in the walk area (`layout.ts`).
  - **One merged static mesh:** table, cabinet with drawers, fiddle rails, pen holder with pencil and eraser, a parallel rule, dividers, and the lamp's base, arm and shade.
  - **Separate parts:** the paper chart, the lamp bulb, the lamp switch (Toggle `chartLamp`, Deck lights breaker, 0.5 A), and the logbook's page and pen.
- **Paper chart** (`nav/paperChart.ts`): drawn once from the terrain.
  - Printed-chart style: buff land with a dark coastline, blue shallows, soundings, a half-minute lat/long grid, island and port names, a compass rose and a title block.
  - North points to port (you face the wall), at about 1:5500.
  - `chartToTable()` maps world metres to the table, ready for the M7 pencil marks.
- **Chart grid** (`nav/geo.ts`): world origin at 56°37.2'N 005°57.0'W (`CONFIG.nav`). `formatPosition()` gives the log's positions.
- **Light, with no real lights:** the chart and pages are unlit materials whose brightness follows daylight, the cabin lamp and the chart lamp. With the lamp on, the table gets a warm emissive glow. Below `log.readLight` daylight, the book can't be read or written without the lamp.
- **Ship's log** (`log/log.ts`, `WorldState.log`, host-authoritative):
  - **Voyages:** a voyage runs from a departure to an arrival; arrival closes it. The last 5 are kept and saved by the host in localStorage.
  - **Events:** leaving within 300 m of a port, or being moored alongside / anchored in an anchorage. Each puts a "Log: …" duty on the duty board, ticked when the entry is signed. Unlogged events drop off after 10 min.
  - **Entries:** type, ship's clock, lat/long and port, filled in at signing. The fuel reading is checked against the gauge (nearest of Full / ¾ / ½ / ¼). The arrival entry carries the voyage's score (correct readings / checked).
  - **Writer lock:** one person writes at a time; someone else can take over after 90 s idle.
  - **Intents:** `logBegin`, `logPick`, `logSign`, `logCancel`.
  - In multiplayer the log rides in the snapshots for now. Milestone 10 moves it to its own messages.
- **Logbook view** (`log/logbookView.ts`): an open book with both pages on one canvas, redrawn only on change.
  - Left page: handwritten entries, paged, with ◀ ▶.
  - Right page: entry-type boxes (with "due" hints from events), the readings, a Remarks line (filled by desktop voice in M9), and a "Sign here" box.
  - VR: point and trigger. Desktop: click.
  - Signing animates the pen from its holder to the box and back. Paper sounds (tick, scribble, page) in `audio/paperAudio.ts`.
- **Simplification:** signing is a press on the box, with the pen animated, rather than picking the pen up. The pencil (M7) will be a real hand-held tool; the pen could follow if you want it.
- **Draw calls:** +5 (table, chart, bulb, book body and pages, pen); about 34 in view at the table.
- **Tests (232):**
  - departure event and duty, signing with time, position, port and checked fuel, duty ticked;
  - a wrong reading is not ticked; arrival closes the voyage with its score, and the next entry opens a new voyage;
  - no signing until filled in; the writer lock and idle takeover;
  - events expire;
  - save/load keeps the last voyages and drops junk;
  - position format.

### E7: drawing on the chart (done, awaiting owner test)

- **Marks** (`chart/marks.ts`): strokes in chart coordinates (world metres), so they line up with real places.
  - Points are at least 15 m of chart apart and rounded to 0.5 m.
  - Ops: `start`, `add`, `set` (straight lines while dragging), `erase` (rubs out points within r and splits strokes where cut), `clear`.
  - **Cap:** 4000 points. Over it, the oldest strokes go, and as the cap nears the oldest are drawn fainter.
  - Saved by the host / solo player in localStorage (`swvr.chart`, at most once a second).
- **Multiplayer, done now rather than in M10:** marks are not in WorldState, because they're too big for the 20 Hz snapshots.
  - Each peer keeps a copy and applies the same small ops: new `chart` messages both ways (`net/protocol.ts`).
  - A client applies its own ops at once and sends them; the host applies them and relays them to everyone else.
  - The welcome message carries the whole set. Several people can draw at once.
- **Rendering** (`chart/chartTools.ts`): the marks are thin graphite line segments 1.2 mm above the paper.
  - One draw call, redrawn only when the marks change; vertex colours do the fading.
  - No canvas texture uploads (simplification 2 from the plan).
- **Hand tools** (moved out of the table's merged mesh): pencil, eraser, parallel rule.
  - **Pick up and put down:** grip near a tool picks it up. A hand holding a tool gives its grip and trigger to the tool and nothing else. Let go and it goes home.
  - **Pencil:** the tip sits 11 cm ahead of the grip. Within 6 mm of the paper it draws: the tip locks to the paper and the line is smoothed against tremor and the boat's motion. A light haptic tick runs while drawing, with a graphite scratch that follows the speed.
  - **Straight lines:** hold the trigger for a straight line from the stroke's start. Near either outer edge of the parallel rule (1.5 cm), the line snaps onto the edge.
  - **Rule:** held within 12 cm of the chart it lies flat, at the hand's position and heading. Released there it stays; anywhere else it goes home.
  - **Eraser:** rubs out within 12 mm of table (with a rub sound and haptics). Hold its trigger 2 s to clear the chart.
- **Desktop** (`DesktopPointer.chart` hook):
  - Aim at the chart and drag to draw (mouse-look aims the line). Shift gives a straight line; right-drag erases.
  - The pencil or eraser is shown at the reticle. While they're in use, the buttons go to them and nothing else (no ping, no control presses).
- **Chartplotter:** shows the crew's marks faintly (`chartMarks.showOnPlotter`, on).
- **Plot it yourself** (`rescue.plotYourself`, default off; Menu → Tests → Chart): the call gives "last seen in position 56°38.1'N 005°55.2'W" instead of bearing and range, and the plotter shows no search area or bearing to it.
- **Debug:** Menu → Tests → Chart: mark count, **Clear marks**, Plot it yourself.
- **Profile (milestone 7):** headless with SwiftShader, CPU only. Squall at full rain, wipers on, 3600 points on the chart.

  | | M5 | M7 |
  |---|---|---|
  | Draw calls at the helm | 48 | 48 |
  | Draw calls, aft deck looking forward (through the door) | 96 | 109 |
  | Draw calls at the chart table | – | 40 |
  | View CPU per frame | 1.2 ms | ~1.7 ms (noisy at this frame rate) |
  | Sim tick | 0.19 ms | 0.23 ms |
  | Triangles | ~160k | ~161k |

  The chart table and its tools are about 10 draw calls. If that matters on the Quest, the next step is to merge the book cover into the table and hide the tools from outside the wheelhouse.
- **Tests (238):**
  - ops, including straight lines and rounding;
  - bad ops ignored;
  - the eraser splits strokes;
  - the cap drops the oldest;
  - save/load;
  - multiplayer: a joiner gets the chart, and a client's stroke reaches the host and the other client (not echoed back). The host's erase reaches everyone.
- **Checked in the browser** with a simulated VR hand: pencil pick-up and a drawn circle; the rule laid flat on the chart, where a wobbly line along its edge came out exactly straight; the eraser splitting the line; desktop drag and Shift lines.

### E8: passing ships, hazards and the rest of the log (done, awaiting owner test)

- **Chart table moved aft** against the aft wall, under the whiteboard (owner feedback), at z 0.08 to 1.40. The book is at the aft end, with the lamp and pen holder beside it, and there's more room behind the helm.
- **Traffic** (`traffic/traffic.ts`, `WorldState.traffic`, host-simulated; no physics):
  - **Spawning:** out of harbour, a ship every 150–360 s (at most 2 at once). It's put on a course crossing ahead of the workboat 350–900 m off, starting 1.8–2.6 km away. The track is checked clear of land (deeper than 8 m every 100 m).
  - **Despawning:** a ship goes when it's 3.6 km off and opening.
  - **Types** (config `traffic.ships`): coaster 82 m at 6.5 m/s, fishing boat 19 m at 4 m/s, yacht 12 m at 3 m/s, each with AIS names.
  - **Sighting:** a ship is sighted within min(2.5 km, 1.1 × visibility). That's a `vessel` log event with its true type and bearing, and the lookout calls it out.
  - **Fog signals:** in visibility under 1 km, ships within 3 km sound a prolonged blast every 2 min. The nearest answers yours: the fog duty's 4 s blast calls `answerFogSignal`.
  - **Debris:** spawned every 300–600 s (at most 2), 400–900 m from the boat, drifting downwind like everything in the water.
  - **Hazards:** debris, the rocks (Gull Rocks, Skerry) and 3 hazard buoys (config). Passing within 200 m, out of harbour and in sight, is a `hazard` event (once until she's 500 m clear).
- **Views** (`traffic/trafficView.ts`):
  - Each ship type is one merged vertex-coloured mesh, shared. The hull is an extruded plan with a pointed bow; there's superstructure, containers, gantry, or mast and sail.
  - Nav lights are a few fixed-size points, shown in the dark only.
  - Ships bob, pitch and roll from three wave samples (big ships less). Positions ease between snapshots.
  - Debris is one small shared mesh; the hazard buoys are one instanced mesh.
  - Ship horns (`audio/shipHorn.ts`): HRTF-placed, deep for the coaster and thin for the yacht. They arrive after distance / 343 s and are low-passed with distance.
- **Chartplotter: AIS.** Ships as triangles with their name and a 6-minute course line, in any visibility. They're the radar replacement the owner chose.
- **Log** (`log/log.ts`): four more entry types, each with a "Log:" duty.
  - **Vessel sighted:** type, and direction from us in 8 points (correct within 45° of the true bearing).
  - **Hazard:** debris / rocks / buoy.
  - **Weather change:** an event when the preset changes. Sea (calm < 0.5 m Hs < moderate < 1.25 m < rough) and visibility (good ≥ 4 km) are checked against the world when signed.
  - **Rescue:** an event when one is completed (`RescueState.lastDone`). Nothing to pick; the summary goes in the entry's remarks.
  - An entry is ticked only if all its checked readings are right.
  - The book's option boxes now wrap onto more rows (8 compass points), and readings are written out ("Fishing boat, bearing NE", "sea moderate, vis. good").
- **Debug:** Menu → Tests → Traffic: counts, **Spawn ship**, **Spawn debris** (close by).
- **Wipers** drawn thinner (they looked heavy parked in dry weather).
- **Draw calls:** +1 per ship in view (+1 for its lights at night), +1 per debris, +1 for the buoys. Typically 1–3 more.
- **Tests (243):**
  - a ship spawns out at sea, moves, is sighted and logged; type and direction are checked right and wrong;
  - far-off ships go; none spawn in harbour;
  - debris and the rocks become hazard events of the right type;
  - in fog, ships sound every 2 min and answer our prolonged blast;
  - weather and rescue events; weather readings are checked.

### E10: duty board integration, multiplayer and polish (done, awaiting owner test)

Desktop voice input (milestone 9) was skipped at the owner's request.

- **Transit jobs** (`duties/duties.ts`):
  - **fendersOut:** within 200 m of a berth, under way, fenders in.
  - **fendersIn:** fenders out, over 350 m from any berth, moving.
  - **lash:** loose cargo, out of harbour, engine running; skipped while a weather "secure" duty is up.
  - **oil:** a check is due every 15 min of running. Pull the dipstick; top up if it's low (the step becomes required when low).
- **Fenders** (`controls/deckGear.ts`): a FenderBasket control on the aft deck and six fenders, one instanced mesh. They hang just outside the hull on their lines when out, and lie along the bulwark when stowed.
- **Engine oil** (`vessel/maintenance.ts`):
  - Burnt at 0.00025/s × (0.5 + load); the session starts at 72 %.
  - An engine hatch plate in the wheelhouse floor, with a Dipstick control (pull: the App shows the reading) and an OilCan control (top up).
  - The OIL lamp blinks running below 12 %. No damage.
- **Weather forecast log entry:** each forecast received is a `forecast` event ("Log: weather forecast"). The entry carries the forecast text; just sign.
- **Book:** remarks wrap onto several lines.
- **Multiplayer:**
  - **Bug fixed:** clients never copied `duties`, `forecast`, `log` or `traffic` from the host's snapshots, so a crewmate's duty board, logbook, forecast and AIS stayed empty. They're copied now.
  - **The log** is left out of the 20 Hz snapshots and sent whole in a `log` message only when it changes, like the chart marks.
  - **Held tools:** a chart tool in hand (pencil, eraser, rule) travels in the player's pose and shows at their hand. Everyone else's table hides that tool while it's held.
- **Polish:**
  - **Auto rain quality:** in the headset on High, if frames average over 16.5 ms for 3 s while it rains, the rain drops to Low for the session (a notice says so; the menu setting is unchanged).
  - **Battery drain between sessions** (`electrics.drainBetweenSessions`, off by default): with it on, the batteries' charge and master are saved on leaving. Next visit, a master left on has drained `drainPerHour` per hour away.
  - **Windows and door** (`vessel/view/wheelhouseClosure.ts`):
    - A WINDOWS switch on the console shows faint glass in every opening (one transparent mesh).
    - A sliding aft door opens while anyone aboard is within 1.1 m of the doorway, so it never blocks walking.
    - Windows shut with the door closed makes the wheelhouse "sealed": wind inside falls from 35 % to 10 %, and the rain drum is quieter and duller. There's an optional step in the "secure" duty.
  - **The pen is a real tool:** grip it from beside the book; its tip touching a box presses it (once per touch), signing included. Pointing and trigger still work.
  - **Draw calls:** the book's cover and page blocks are merged into the table mesh. The chart, bulb, book pages, pen, tools and marks are hidden whenever the viewer is outside the wheelhouse.
- **Debug:** Menu → Tests → Engine oil: level, next check, **Low + check due**.
- **Final profile:** headless with SwiftShader, CPU only. Night squall at full rain, wipers and windows on, two ships and debris, 3600 points on the chart.

  | | M7 (day, no ships) | M10 (night, worst case) |
  |---|---|---|
  | Draw calls at the helm | 48 | 54 |
  | Draw calls, aft deck looking forward | 109 | 109 |
  | Draw calls at the chart table | 40 | 44 |
  | View CPU per frame | ~1.7 ms | ~2.2 ms |
  | Sim tick | 0.23 ms | 0.25 ms |
  | Triangles | ~161k | ~167k |
  | Shader programs | – | 31–34 |

  The night extras are the ships' lights and the debris.
- **Not done:** a real two-headset session. Multiplayer is covered by the in-memory loopback tests: chart ops, the log message, held tools, cargo, holds. The PeerJS server can't be reached from the build machine.
- **Tests (247):**
  - fenders out and in;
  - the oil check, dipstick reading and top-up;
  - a forecast becoming a log entry;
  - the log travels outside the snapshots;
  - a client's held pencil reaches the host's world.

## Skiff gear lever, berths on every pier, laser pointer (owner requests)

- **Skiff gear lever** (`controls/GearSelector.ts`): it now stands upright and tips fore and aft (forward = ahead, back = astern) instead of turning like a dial.
- **Dock at any pier** (`world/berths.ts`):
  - Every quay and pier face with deep water alongside now has a berth every 12 m, as well as the named berths: 24 in all, including both sides of the Brannock pier.
  - DOCK, the hot-spot light and the fender duty use them all (`allBerths()`).
  - Only the named berths have painted strips on the quay.
- **Laser pointer replaces the ping** (`player/laserBeam.ts`):
  - VR: hold the right stick in. Desktop: hold the right mouse button.
  - A thin beam and a bright dot where it hits: a boat, the islands and quays, cargo, the platform or the sea. On a boat the dot rides with her.
  - It travels in the pose (frame coordinates), so the crew sees it in your player colour. It is drawn, not simulated: no world state.
  - Tunables: `CONFIG.laser` (reach 600 m, 15 hit look-ups a second).
  - The ping code, its sound and its tests were removed.
- **Tests:** docking at a generated pier berth; the laser travels in the pose (bad numbers dropped).

## Towing missions (owner request)

The brief's "no new physics bodies or ropes" rule was flagged; the owner approved this plan: the tows reuse the existing boat physics, and the towline is one spring.

- **Tows** (`CONFIG.vessels.derelict / logRaft / barge`, `tow/towLook.ts`):
  - Three new towable hulls: a 7 m motor cruiser (2.75 t), a raft of logs (6.4 t) and a 9 m work barge (10.5 t).
  - Each is an ordinary vessel def with no engine. It floats, drifts with the wind and bumps into things with the same physics as our boats.
  - Masses are the DWL displacement and the CG sits over the LCB, so they float level (checked by a test).
  - The logs and the barge have extra wave-making drag, because they're bluff.
  - Each has its own one-draw-call model, with an orange bow eye on the stem.
- **The job** (`tow/tow.ts`, `WorldState.tow`):
  - Out of harbour with no rescue on, a call comes every 4–9 minutes (`CONFIG.tow.every`). The tow is spawned 450–850 m ahead, a little to one side, in open water.
  - Picking up the handset takes the job. Unanswered, it goes away after 2 minutes.
  - While a tow job is on, a cargo-run rescue call waits until it's over.
  - Calls only come by themselves in the game (`createWorld` `tows`); tests raise them by intent.
- **The towline:**
  - One spring-damper from our towing post (a new bollard on the aft deck) to the bow eye. It pulls only when stretched past 22 m.
  - Damping is set to half of critical on the two boats' reduced mass, so a heavy barge isn't springier than a light cruiser.
  - It parts above 40 kN or 12 m of stretch. A slack-to-taut snatch at full ahead with the barge peaks at about 32 kN, so in practice it takes something harsher, such as a snag or grounding.
  - It's drawn as one instanced mesh of 14 cylinders. Slack, it sags to its length and floats on the surface.
- **Making fast:**
  - VR: touch the bow eye with the boat hook's tip. Desktop: click it with the hook.
  - Either way, our stern must be within 16 m of her bow.
  - The menu's Boat tab has a Tow row (status, Make fast / Cast off).
- **Delivery:** within 170 m of a port and under 0.8 m/s for 5 s.
  - A radio thank-you, and the job is counted with the rescues (Cargo tab: "Missions … (n tows)").
  - It goes in the log as a rescue-type event.
  - The tow is removed once we're 120 m clear (never while someone stands on it).
- **Plotter:** an orange TOW diamond. The plotter keeps the tow in view until it's on the line, then the nearest port.
- **Radio:** a tow call rings and flashes the VHF like a distress call.
- **App:** vessel views are now created and removed as tows come and go (`syncVesselViews`). A client joining checks the version against the fixed boats only.
- **Tuning (towed at half / full ahead):**

  | Tow | Half ahead | Full ahead |
  |---|---|---|
  | Cruiser | 7.6 kn | 11.3 kn |
  | Logs | 6.4 kn | 9.2 kn |
  | Barge | 6.4 kn | 8.3 kn, line at about 25 kN |

- **Debug** (Tests tab, Tow row): Cruiser / Logs / Barge put one just astern, ready to make fast. Call raises a call; End ends the job.
- **Tests (6):**
  - the hulls float level;
  - a call comes, the handset takes it, unanswered calls time out;
  - towing at speed on a taut line;
  - out of range, and a snatch parts the line;
  - delivery, the mission count, the log and removal;
  - a client making fast over the network.

## Free grab-the-world in VR (owner request)

- **Grab-the-world** (`player/locomotion.ts`) now moves you in all three directions with no collisions. You can pull yourself up, down, through walls or out over the side.
  - Once you've pulled, you're "free": no settling onto the floor. You stay at the height you pulled to, which squares seated and standing play without the crouch button.
  - Being put somewhere else ends it, and the floor holds you again. That covers a teleport, boarding, landing a jump, and climbing out of the water. These are detected as a jump in your position or a change of frame between frames.
- **The VR stick** slides without wall collisions too.
- **Unchanged:**
  - Desktop walking keeps wall collision and the ladder climb.
  - Swimming strokes stay horizontal.
  - The comfort fade still darkens the view while your head is inside a wall.
- **Tests:** flying up and out through a wall; the height staying; the stick passing a wall; a teleport ending free flight. The older collision tests now run with fly off (desktop rules).

## Wheelhouse door by hand, boat hook auto-extend (owner requests)

- **Wheelhouse door** (`controls/WheelhouseDoor.ts`): the door now has a large window, so you can see astern from the helm with it shut.
  - It's no longer automatic. A press control (trigger in VR, click on desktop, from inside or out) toggles `controls.door`, which is shared in multiplayer.
  - It starts open. Shut, it blocks desktop walking; VR movement has no collisions.
  - The "sealed" quiet wheelhouse needs the windows shut and the door shut.
  - `bridge.doorOpenRange` is gone.
- **Boat hook auto-extend** (`rescue/rescueHands.ts`, menu Comfort → Boat hook reach: Auto-extend / Fixed; on by default, remembered per device):
  - Point the hook at a floating crate or a tow's bow eye up to 8 m away (`CONFIG.rescue.hookAutoReach`) and it telescopes out to it at 10 m/s. In VR the tip touching it hooks it.
  - With a crate on it, the hook slides back to its own length at 1.5 m/s, bringing the crate alongside.
  - Desktop: the hook reaches what's under the reticle up to 9 m, and a click hooks it.
  - The drawn hook telescopes: the pole stretches and the head moves out.
- **Tests:** the door control; desktop auto-extend hooking a crate 6 m off the side, and not when Fixed.
- **Fix (owner feedback):** the boat hook on the bow eye now also **casts off** a fast towline. Desktop: click it again; the label says which it will do. VR: each touch toggles once, so take the tip away and touch again. Test: click to make fast, click to cast off.

## Fixes: tow clean-up, glow plugs, door sound, no ruler, four AI ships, no debug panel (owner feedback)

- **Delivered tows are cleaned up:** the harbour takes the tow over 8 s after the hand-over (`CONFIG.tow.removeAfter`), however close you are. Before, it was only removed once you were 120 m away, so delivered logs were left drifting about.
- **Glow plugs:**
  - Cold, the preheat is now 2.5 s (was 4). It falls linearly with coolant temperature to 0.6 s once she's warm (`preheatNeeded()`; `preheatHotTime`). The glow lamp, the duty-board step and the start all use it.
  - The plugs no longer cool while she's cranking (they're powered with the starter), so a properly preheated engine catches in about the plain crank time.
- **Wheelhouse door muffles the outside:** sound now grades with how shut-in the wheelhouse is (`CONFIG.wheelhouseSound`). The door counts 0.6 and the windows 0.4. Inside, wind, rain and the hull wash are muffled in proportion, so shutting the door alone makes a clear difference. Before, it took both shut to change anything, and the wash wasn't muffled at all.
- **No parallel rule on the chart table:** the pencil's straight-line trigger covers it. The mesh, snapping and the multiplayer tool kind are gone.
- **Four AI ships:** `traffic.maxShips` is 4. The first comes 5 s in; while there are fewer than four, another comes every 20–45 s.
  - They now appear in harbour too, as long as their whole track is deep water.
  - A "vessel sighted" log event waits while the last one is unlogged, so they don't pile up on the duty board.
- **Debug panel off at start** (`debug.overlayVisibleAtStart`): F3 / I on desktop, B in VR, or the menu.
- **Tests:** a warm engine needs much less preheat; traffic fills to four, and near a harbour ships keep to deep water; the tow is removed soon after delivery even with us alongside.

## Optional log, jobs on the duty board, no exhaust bubbles, calmer motion (owner feedback)

- **The log is optional:** loggable events no longer put "Log: …" duties on the duty board. The logbook still shows them as "(due)", and you can write them or not.
- **The duty board shows the jobs** (`duties.ts`: `cargo`, `rescue`, `tow`), kept in step with the world:
  - **Cargo job: deliver to X**, with cargo aboard bound for a port: "take her to X" (ticks when she's in), then "set the cargo down ashore".
  - **Rescue: man overboard / lost deck cargo:** answer the call; search and recover; land the survivors (people only).
  - **Tow: …:** answer the call; make the towline fast; bring her into any harbour.
  - A job that ends ticks off. A call nobody answered just goes and isn't counted as done.
- **Logbook in VR with many entries:** I couldn't reproduce it. A new test (`logbookView.test.ts`) clicks each entry type with a VR trigger ray through 10 signed entries, and every one starts an entry.
- **Exhaust bubbles removed** (`dieselWorklet.ts` is mono now). With the outlet under water the note still goes dull and muffled, as before.
- **Calmer motion:**
  - Workboat damping raised: roll 33000 → 70000 N·m·s (about 27 % of critical in the free-decay trial, was about 15 %), pitch 20000 → 40000, vertical 800 → 1300 per m².
  - Measured over 60 s in the default sea, before → after:

    | Case | Roll RMS | Helm vertical acceleration RMS |
    |---|---|---|
    | Drifting beam-on | 6.7° → 5.2° | 0.74 → 0.65 m/s² |
    | Under way in head seas | 5.8° → 4.0° | 0.36 → 0.28 m/s² |

  - Desktop now has its own motion coupling, 30 % by default (`comfort.desktopMotionCoupling`; keys 9 / 0). The screen follows the boat's slow attitude but soaks up the quick roll and heave, which is what made onlookers sick. VR keeps its own setting (100 % by default, so hands stay on the controls).
- **Tests:** duty-board jobs (tow steps, unanswered call, rescue, cargo); logbook VR clicks; the sea-trials roll band is widened to 35 %.

## Run, swim ladder, steerage when coasting (owner requests)

- **Run:** walking speed × 2.4 (`locomotion.runMultiplier`).
  - Desktop: hold Shift (it was 1.8× "brisk").
  - VR: push the left stick right to the edge. It ramps from walk to run over the last fifth of the stick's travel, so it doesn't lurch. A stick click was already "board".
  - Not while swimming.
- **Swim ladder** (`workboat.swimLadder`, `player/body.ts` `swimLadderOf`):
  - Stainless rails hooked over the starboard bulwark on the aft deck at z 4.3, down to 0.9 m below the waterline, with treads every 0.3 m. Merged into the bridge's static mesh.
  - From the water, grip any rung (VR), even just above the water where the gunwale is out of reach. Or press jump within 2 m of it (desktop). Either way you're put on deck at its head.
- **Steerage when coasting** (`rudder.coastSteer` 1.5, `coastFadeThrust` 8 kN): the rudder's force from the flow past the hull is 1.5× with no thrust (the skeg helps), fading back to 1× as propeller thrust builds.
  - Coasting in neutral with the helm hard over, she turns 26.6° in 6 s (was 19.3°).
  - Under power the turning circle is unchanged (the sea-trial band still holds).
- **Tests:** the ladder (a low rung, and the jump button near it); the coasting turn, better than with the bare rudder.

## NAV / WIND display, binoculars, fire missions (owner requests)

The brief's "no new particle effects" rule was flagged: the fire is drawn without a particle system. The flames and smoke are a fixed handful of camera-facing billboards animated by a shader (two instanced draw calls), and the jet is one instanced mesh along its arc. All of it is only there during a fire.

- **NAV / WIND display** (`controls/instruments.ts`, the atlas's free sixth slot; no extra draw call):
  - Overhead on the centreline just forward of the overhead panel, tilted toward the helm.
  - Shows position (lat/lon), SOG, COG, heading, the true wind (from, knots, Beaufort), and an apparent-wind dial relative to the bow.
  - A first spot, hung lower in front of the windscreen, blocked the view ahead and was moved.
- **Binoculars** (`player/binoculars.ts`), 7×, on the dash top, port end:
  - VR: grip them to pick them up; raised within 20 cm of the eyes they show a head-locked lens view. That view is a second, small (640² px), narrow-field render of the scene, only while you're looking. WebXR fixes the eyes' projection, so it can't be a zoom of the eyes themselves.
  - Desktop: hold Z. The field of view narrows 7×, the screen is masked to two circles, and mouse look slows to match.
- **Fix found on the way:** the desktop heave filter could lift the eye 0.4 m for several seconds after boarding (the boat was still settling from its spawn drop). A sudden jump in deck height now resets it.
- **Fire missions** (`fire/fire.ts`, `fire/fireView.ts`, `fire/monitorView.ts`, `audio/fireAudio.ts`):
  - **Calls** come like tows: one job at a time (rescue, tow and fire each wait for the others), handset to accept, 2-minute timeout.
  - A **boat fire** burns 400–800 m ahead in open water. A **shore fire** is a shed on dry land 0.8–6 m up, with water at least 6 m deep within 45 m, within 1.5 km of us.
  - **The fire:** intensity starts at 0.6 and grows at 0.004/s up to 1. Water on it knocks it down at 0.02/s at full flow, so about a minute from full. Below 0.03 it's out. It counts as a mission and goes in the log; the wreck smoulders 40 s, then goes.
  - **The monitor:** a red water cannon on the roof (pan ±170°, elevation −10…55°), driven like the searchlight from its own joystick (red knob, pedestal starboard of the throttle; `monPan` / `monTilt`, held like the searchlight in multiplayer). The FIRE PUMP switch is on the console right of the wheel.
  - **The jet** flows with the pump on and the engine running, at 30 m/s and 2400 L/min. `jetPath` integrates the nozzle velocity plus the boat's own, with gravity, air drag 0.12/s and 35 % wind drift, down to the sea or the ground.
    - The same function scores hits (the arc passing within the hit radius, up to the flames' height) and draws the jet from the rendered boat.
    - About 70–90 m range at 30° elevation.
  - **Views:** a burnt fishing-boat hulk bobbing on the swell, or a shed. Flames are alpha-blended so they stay orange against the sky. The smoke column drifts downwind and turns to white steam while you're on target. The jet is translucent white water widening as it flies, with a splash where it lands.
  - **Sound:** a fire roar (rumble and crackle) by distance and intensity, and a jet hiss. Both are muffled in the wheelhouse.
  - **Wiring:** duty board (answer; engine running and FIRE PUMP on; put it out), plotter FIRE mark, VHF rings for fire calls, status line, and Tests-tab debug buttons (Boat / Shore / Call / End).
- **Tests (4):** the jet only with pump and engine, an arc ahead that's shorter lower and to starboard with pan; a boat fire grows unattended, then the aimed jet puts it out (counted, logged, duty done, wreck removed); calls, handset and timeout; a shore fire is on dry land with deep water within reach.
- The engine-temperature suite (14 simulated minutes) gets a 30 s limit like the other long-simulation suites.

## Logbook fixes (owner feedback after fire missions)

- **VR: couldn't tick a log entry.** The whiteboard hangs right beside the book, and its bottom edge comes down past the table. The board was checked first and took the hand whenever the ray, carried on, met its rectangle. Now the nearer of the two takes the hand (`rayDistance` on both, arbitrated in `App`).
  - The pen's press zone runs 15 cm into the page (it was a thin band), and the other hand's laser still works while one hand holds the pen.
- **Desktop: the "(due)" marks didn't go.** Signing worked, but with four AI ships about, the next sighting queued the moment one was logged, and hazards stacked one per rock or buoy passed. Now:
  - one signed entry clears everything of its type that's waiting, at once;
  - ship sightings are spaced at least `traffic.sightEvery` (300 s), and only one hazard waits at a time;
  - unlogged events drop off after 5 minutes (`log.eventLinger`, was 10).
- **Tests (1):** signing a hazard entry clears all three waiting hazards and leaves the weather change.
- **Desktop laser pointer** (owner: right click froze the game, no beam):
  - The beam started at the eyes, so it was seen end-on: only a small dot showed. It now starts at a "hand" down and to the right (`laser.deskHand`) and reads as a line to the reticle.
  - The hit lookup ran every frame while the beam hit nothing (the sky, the horizon): a whole-scene raycast each frame. It now runs `hitRate` times a second whatever it hits.
  - The browser's context menu is blocked on the whole page while the mouse is captured; a menu popping up would release the mouse.
- **Wheelhouse windows removed; engine quieter inside** (owner request):
  - The WINDOWS switch, the glass it showed and the `windows` control are gone (the "secure the boat" duty drops its windows step). The windscreen's rain and wipers stay.
  - How shut-in the wheelhouse is now depends on the aft door alone: shut, it fully muffles wind, rain, wash and fire inside.
  - The engine sound gets a wheelhouse low-pass and level (`CONFIG.wheelhouseSound`): full on deck; inside with the door open ×0.75 and 1200 Hz; door shut ×0.45 and 320 Hz.
- **Tidier foredeck and stern; collisions sorted** (owner requests).
  - **Crane folds away:** while the skiff is in her cradle (or away in the water) the crane folds into a transport position: slewed forward, the boom just below level along the starboard foredeck, the jib folded back over it, the hook at the jib head (`tenderCrane.fold`). The view blends the working pose and the folded one angle by angle.
    - LAUNCH now starts with `rigTime` (2.5 s): the crane unfolds and hooks on while she stays in the cradle, then hoists. A recovery ends with the crane unhooking and folding.
    - The launch is 17.5 s in all.
  - **Tarpaulin over the stowed skiff** (`TenderCraneView.cover`): one canvas mesh over a low ridge, drawn down over her gunwale, closed at the transom, with a bag over the outboard. Her outboard and tiller (20 draw calls) and the crane remote (3) aren't drawn while she's covered.
    - They're also disabled: three's Raycaster ignores `visible`, so a hidden control would still take clicks. There's a new `Control.enabled`, which the interaction system skips.
    - While she's covered you can't board her from the menu (it says to launch her first), jump into her, or set cargo down in her.
    - Her hull stays drawn below the cover.
  - **Winch buttons built in:** HEAVE IN / PAY OUT now sit on the top of the winch's own gearbox housing (starboard end, 0.8 m high: `towWinch.housing`), which replaces the separate stand and the motor cylinder.
  - **Trawl A-frame** (`fishing.aFrame`, `aFrameOf` in fishing.ts): the quarter gallows are gone; with the skiff off the stern there's room for an A-frame over the transom.
    - Two legs from the quarters raked aft to a crossbeam 3 m up and 0.3 m beyond the transom, each braced to the deck, with a block each side on the beam where the warps run.
    - The net's drag now acts at the blocks.
    - PAY OUT / HAUL are on a control box built onto the starboard leg at waist height.
    - The A-frame's and braces' feet are solid for walking and cargo. The aft lashing points moved inboard to make room.
  - **Collisions:**
    - **Desktop:** walking tested the CAMERA against the walk area, and the camera can sit about 10 cm off the feet. Once it was past an edge, the "already outside, let me out" escape let WASD walk through anything: on the aft deck it walked 6 m off the side in mid-air. It now tests the feet, so walls, furniture and the deck edge stop you.
    - **VR** (owner request: don't slip off the boat, but move freely through the wheelhouse): grab-the-world and the stick are fenced at the boat's edge (`WalkArea.inBounds`: 0.15 m inside the deck edge, the stem and the transom) and nothing else. A move that would cross it goes as far as the edge, then slides along it; two-handed turns that would swing you out are refused.
    - **Already outside the fence** (leaning out, put there): any move, so you can always get back in.
    - **Over the side:** jump (A).
  - **Tests (299):** the fence (through the wheelhouse wall, stopped at the edge, the stick too); desktop walking stops at the edge with the camera off the feet; the rigging pause before the hoist; the winch housing and the A-frame feet are solid.
  - **Checked in the browser:**
    - The helm view: the tarp dome ahead, the folded crane low along the starboard foredeck.
    - The aft deck and the stern: the A-frame, the leg's control box, the winch housing.
    - SKIFF CRANE launches (cover off, crane unfolds), and the remote in the skiff hovers RECOVER.
    - HEAVE IN shortens the line, PAY OUT on the A-frame moves the net, and desktop walking stops at the port bulwark.
- **Crane access, tow winch, trawl by hand** (owner requests after the layout round).
  - **Crane cables put away in the cradle:** with the skiff stowed, the wire and the 4-leg bridle are hidden and the hook hangs at the jib head (clearer view from the helm). They show from LAUNCH until she's back.
  - **Skiff crane buttons, three of them** (all send `<tender>:crane`, all with the same hover text):
    - **SKIFF CRANE** on the helm console, DECK group (`bridge.craneButton`): she's in view ahead. DOCK, ANCHOR and TRAWL close up to make room.
    - the crane's control box moved to the **outboard side of its post, facing starboard** (`tenderCrane.button`): reached from the starboard side deck, not squeezed between the post and the wheelhouse;
    - a **remote on a post in the skiff**, starboard of the tiller by the helmsman (`tenderCrane.remote`, in her axes; `TenderCraneView.remote` goes in her view root): call the recovery from the water when she's alongside the starboard bow.
  - **Tow winch** (`CONFIG.vessels.workboat.towWinch`, `CONFIG.tow.winch`): the trawl's big drum mid-deck is gone. A small drum (0.5 m wide) on a frame with its motor now sits just forward of the towing post, with a control stand beside it: hold-to-run **HEAVE IN** / **PAY OUT** (vessel controls `winchHeave` / `winchPayOut`; named so the tow intents' `tow*` prefix doesn't catch them).
    - The towline now has a paid-out length (`TowLine.length`, `lineLength()`; unset = as made fast). The winch heaves in at 0.6 m/s and pays out at 1.0 m/s, between 4 and 60 m.
    - Heaving in stalls while the line pulls over 18 kN (`winchStalled`).
    - The towline's stretch, sag and the status line ("19 m out, 3.2 kN") use it.
    - The drum turns while the winch runs (the towline or the trawl warps).
    - Labels on the stand read facing aft (bridge labels can now be turned: `Label` yaw).
    - The winch and its stand are solid for walking and cargo (`onDeckGear` in layout.ts, shared with the crane's cradle and post). The centre lashing point moved forward to z 4.2.
  - **Trawl by hand** (`fishing.netButtons`): **PAY OUT** / **HAUL** hold-to-run buttons on a bracket on each gallows post's inboard side (vessel controls `netOut` / `netIn`). While held the net moves at the shoot / haul rate. Let go part way and it stops ('held': it drags in proportion but doesn't fish). The console TRAWL switch now acts on a flip (all the way out, or all the way in) and follows the hand controls (on while any net is out).
  - **Tests (298):** the winch heaves in / holds / pays out to its limit / stalls under a heavy pull; the net by hand stops part way, drags, doesn't fish, goes on out to fishing, and the switch then hauls it all in; the winch and stand are solid.
  - **Checked in the browser** (desktop clicks): SKIFF CRANE on the console launches her; the remote in the skiff recovers her; HEAVE IN shortens the line; PAY OUT on the gallows moves the net out and holds it. Screenshots: the helm view with no cables, the winch and stand, the gallows buttons, the crane's control box.
- **Wheelhouse and deck layout** (owner request: a round of refactoring the wheelhouse and the gear on deck).
  - **Ship's log removed** (owner: redundant). Gone: `log/` (state, logbook view), `WorldState.log` and its own net message, the logbook on the chart table, the log events from traffic, rescues, tows and fires (`RescueState.lastDone`), and its tests. The chart table keeps the chart, its tools and the lamp (its shade now over the chart). Ship sightings stay, for the lookout.
  - **Forepeak hatch removed** (owner: redundant). The bilge now fills only from hull damage (`wear.leakRate`); rain no longer gets below. The "secure the boat" duty comes up only with loose cargo on deck (lash it; wipers optional), and the bilge duty drops its hatch step.
  - **Door buttons** (owner: the whiteboard clashed with the door). Open, the door slid behind the whiteboard and, being a control, caught hands writing on it. The door is now just a view (`WheelhouseDoor`). A green push button on its starboard jamb, inside and out (`DoorButton`, `layout.doorButtons`), opens or shuts it; it sends the new state, so two crew pressing at once agree. The aft door jambs are 16 cm wide to carry them.
  - **Wipers off the glass** (owner: on the structure above, for a wider clear area). Pantograph wipers pivot on the header above each front pane (`rain.wiperPivotAbove`): a parallel link keeps the 0.6 m blade upright, so it wipes a broad band at eye height (about 1.3-1.75 m above the floor, ±45°, 0.85 m wide) rather than a fan, and parks upright by the window post instead of across the glass. The shader's "last wiped" test follows the blade: a point is under it when the arm is at asin(x / arm) and its height is within half the blade of the arm's tip. All the parts (two links, carrier, blade, boss) are one instanced draw call of scaled unit boxes.
  - **Engine casing** (owner: the oil fill felt like an afterthought on the floor). A waist-high casing over the engine against the starboard wall, aft (`maintenance.casing`, 0.62 m high), with a lid, a handle and air grilles. On top: the dipstick (yellow ring), the yellow filler cap and the oil can. It is furniture for walking (layout.ts), like the chart table. The duty text says where.
  - **Console regrouped** (owner: group like with like, better spacing). Switches in one row on colour-coded plates with titles (`bridge.consoleGroups`; titles in the label strip, plates baked, no extra draw calls):
    - port: **LIGHTS** (nav, cabin, wipers), then **SEARCH · FIRE** (fire pump and searchlight switches, each ahead of its joystick);
    - the horn, just left of the wheel;
    - starboard: **DECK** (dock, anchor, trawl, behind the throttle), then **ENGINE** (heat, start, key, lamps, start-up card).
    - The fire monitor joystick moves to port beside the searchlight's: the left hand aims, the right keeps the throttle. Before, it stood in among the engine controls.
  - **Skiff on the foredeck, with a tender crane** (owner: the stern davit got in the way of towing and trawling; a yacht-style articulated crane). `vessel/tenderCrane.ts` (was `davit.ts`), `controls/TenderCraneView.ts` (was `DavitGear.ts`), `CONFIG.vessels.workboat.tenderCrane`:
    - She sits bow forward in a padded cradle on the foredeck, between the wheelhouse and the bow (her keel 0.1-0.3 m off the deck). Seen from the helm she's below the line of sight to the horizon.
    - A knuckle-boom crane on the starboard foredeck by the wheelhouse corner: slewing column, main boom and folding jib on two hydraulic rams, a wire to the hook and a 4-leg bridle to her gunwale corners.
    - **LAUNCH** (one press, button on the column's control box facing aft, or the menu): hoist 1.1 m out of the cradle (her keel clears the bow rail), slew 155° forward about through the bow sector, lower to the water alongside the starboard bow (3.3 m off the centreline), let go. 15 s in all. A swivel hook doesn't turn her, so she stays bow forward.
    - **RECOVER**: within 3 m of that spot and matching speed, she's lined up under the hook (2.5 s), then it runs backwards and sets her down in the cradle. Crew in her step out onto the foredeck.
    - The crane view solves its two arms each frame (law of cosines, knuckle up) for the jib head over the hook; parked, the hook rests over her in the cradle. One merged static mesh plus two instanced draw calls (the davit was about 14).
    - The cradle and the column are solid for walking and kept clear of cargo.
    - The stern is clear for the towline and the trawl warps.
    - The stowed skiff's outboard is now hidden only when it can't be seen: on the aft deck, or from far off the boat.
  - **Tests (296, all pass):** the launch path (keel above the rails over the hull, never over the wheelhouse, at the water clear of the hull); launch; recover (refused far off, accepted alongside, back in the cradle, crew on the foredeck deck); cradle, column and engine casing solid, the aisle beside the casing walkable; bilge from damage only; the weather duty with loose cargo; traffic sightings spaced. The log's tests are gone.
  - **Checked in the browser:** console groups, casing, door buttons inside and out (click toggles), the crane's launch, the crane button, the client joysticks, the office, first voyage and save slots.
- **App split** (after the performance pass; no change in behaviour). `App.ts` went from 2551 to 2344 lines:
  - **`app/careerSession.ts`:** the career's save slots (`swvr.career.1..3`, `swvr.careerSlot`, the move of the old single save), saving when the career's seq changes (host / solo only), the money pop-up, and the career's menu parts (Office and Career tabs). App passes it a small host (world, workboat id, client or not, notify, environment intent). The crew list stays in App.
  - **`app/laserPointer.ts`:** the beam, the hit lookup a few times a second (boats, islands, cargo, platform, traffic, then the sea surface), the hit kept in the frame of the boat it hit, and the beam for the pose. App only decides when it's on and where it aims from. The desktop ray is now reused rather than allocated each frame.
  - **`app/soundBoard.ts`:** the 15 sound systems, and the unlock on the first click, key or VR entry that hands them the shared AudioContext. App reaches them as `this.sound.engine`, `this.sound.anchor` and so on.
  - **`frame()`** is now a short list of named phases, in the same order as before: `stepSimulation`, `updatePlayer`, `updateSurroundings`, `updateOwnBoat`, `updateBoatsAndJobs` (returns the slam and lap for the hull sounds), `updateSceneViews`, `updateBoardsAndSaves`, `updateCrewViews`, `updateHullSounds`, then render and the overlay.
  - **Checked:** tsc, the 306 tests, the build, and in the browser: the office contract, the first voyage, slot switching and a reload (the balance and the slot come back), the desktop laser (beam and hit; no frame-time cost), the anchor sounds, and a client at the joysticks.
- **Performance pass** (after the phases; headless Chromium with SwiftShader, so the CPU numbers are relative). Everything was on at once: squall, a fire with the monitor going, a barge on the towline, the trawl out, a salvage log, dolphins, the career.
  - **Simulation:** 0.25 → 0.38–0.49 ms per tick against the milestone-10 baseline. The extra towed boat (a full hull simulation) is most of it. Fire, trawl, salvage and career are about 0.01–0.03 ms each. The fire's jet trace is ≤ 60 ground lookups at 0.7 µs.
  - **Draw calls** (the Quest's main cost; WebXR draws each once per eye):

    | View | Before | After |
    |---|---|---|
    | Aft deck, looking forward | 145 | 115 |
    | Aft deck, looking aft | 70 | 52 |
    | Plain scene, aft deck looking forward | 57 | 38 |

    The saving comes from:
    - **`app/interiorDetail.ts`:** the wheelhouse's small parts (20 here: switches, joysticks, gauges, the dipstick and oil can, the checklist card) are hidden while the viewer is outside and more than 1.2 m from the wheelhouse. Never hidden: the throttle lever, the binoculars, and anything with a light (a light's visibility change recompiles shaders). Hit tests still work, since three's Raycaster ignores `visible`.
    - **The stowed skiff's tiller** (18 draw calls) is hidden while she hangs on the davit.
  - **`money()`** no longer uses `toLocaleString` (Intl), which showed up in the profile because the duty board and pop-up call it each frame.
  - **Still worth doing on the headset:** read the perf panel's cpu/gpu lines in VR with a fire and a tow on. If the GPU is the limit, `xr.framebufferScale` / `xr.foveation` are the levers (see Performance on the Quest).
- **Phase 3: onboarding and sessions** (owner request).
  - **First voyage** (`career/tutorial.ts`), kept with the career (`CareerState.tutorial`):
    - **Steps:** 8 checks on the world (aboard, master, INSTR, engine running, in Calder Haven, moored at a Calder berth, cargo aboard or in hand, one more delivery).
    - **Prompts:** each step is announced once on the VHF by the harbour master and ticked on the duty board as a 'tutorial' job. The end pays £200 (`career.tutorialBonus`).
    - **Controls:** Skip and Again (intents `tutorialSkip` / `tutorialRestart`).
    - **Who gets it:** a fresh career only. Tests and careers saved earlier have none (counted as experienced). The step is saved and re-announced on load.
  - **Career slots** (App, host / solo):
    - `swvr.career.1..3` plus the slot in use (`swvr.careerSlot`); the old single save moves into slot 1.
    - Switching saves the current career and loads the other, or a new one with the first voyage, with the boat's condition.
    - "New career in this slot" needs two presses within 4 s.
  - **Menu:** the Office tab was too tall, so it's split: Office (contract, job board, repairs, chandlery) and Career (first voyage, balance, reputation, ledger, slots).
  - **Playing together:**
    - the host's game code on the duty board header (`DutyBoardView.update(world, note)`);
    - a crew list on the Crew tab;
    - the last joined code is remembered (`swvr.lastGameCode`) and prefilled.
  - **Tests (2):** the whole first voyage (start-up, Calder, dock, load, deliver: radio, duty board, welcome bonus); skip, restart, the step saved and said again, and an old career without one.
- **Phase 2: damage, wear and weather risk** (owner request). `vessel/wear.ts`, with repairs and danger money in `career/career.ts`.
  - **Hull damage** (`VesselState.damage`, 0..1), from the contact state the physics already keeps:
    - impacts faster than 1 m/s do (v − 1)² × 0.08;
    - grinding (sliding faster than 0.4 m/s under more than 20 kN) does 0.02 per metre.
    - Measured: the start drop, a teleport to a berth and DOCK do none; ramming the quay head-on at 3 m/s does between 5 % and 80 %.
  - **Leaks:** damage × 1/40 of the bilge per second (`bilge.ts`). The pump clears 1/90 per second, so it can't keep up from about 45 % damage.
  - **Bilge water is weight:** 3 t when full, added to the payload low in the hull (`simulation.ts`), so she sits about 10 cm or more deeper. This gives the bilge physics for the first time.
  - **Engine wear** (`EngineState.wear`): coolant over 98 °C wears it at 0.0004 per °C per second; oil under 15 % at 0.004 per second. The governor's rack is capped at 1 − 0.5 × wear.
  - **Repairs** in port (`careerRepair`):
    - hull: £30 per %, clears the bilge;
    - engine: £25 per %, engine off;
    - on credit allowed.

    The condition is kept with the career (`CareerState.boat`) and restored on load. Duty board jobs "Hull damaged" and "Engine worn" stay up until mended.
  - **Weather:** trawling stops in a sea over Hs 2.2 m (status 'rough'). Rescues, tows and fires pay +50 % in a squall or over Hs 1.8 m (`heavyWeather`), marked "(heavy weather)" in the ledger.
  - **Menu:** Office → Repairs (hull, overhaul), and Tests → Side jobs → Damage.
  - **Tests (5):** routine harbour work does no damage; ramming the quay holes her, and she leaks and sits deeper with a full bilge; impact, grinding and engine-wear arithmetic and the power cap; repairs in port only, the engine stopped for an overhaul, the condition saved; no fishing in a big sea, and danger money.
- **Phase 1: the career layer** (owner request, after the feature summary): money, port reputation, harbour office contracts and upgrades, in `career/career.ts`. It's plain shared state (`WorldState.career`), host-authoritative, in the snapshots, and saved in the host's browser (`swvr.career`).
  - **Pay** is reported where each job finishes:
    - `earn()` is called from `cargo.retire` (cargo by distance, fish, lost crates; lost overboard costs), salvage sold, debris cleared, tow delivered, the three rescue endings, and fire out.
    - Pay is scaled by the port's reputation factor (1 + 0.5 × rep/100).
  - **Costs:** `stepCareer` watches the workboat. Fuel that flows in while refuelling is billed when the hose comes off, and an oil top-up is billed per can.
  - **Reputation** per port, 0–100. Each kind of job gains some at the port it's for; lost cargo and failed contracts lose some.
  - **Contracts:** two per port, renewed every 10 min, in three tiers by count:
    - cargo to the port, fish landed there, or logs sold there;
    - a bonus and a time allowed per item;
    - tiers need reputation 0, 15 or 40 at that port.

    Accept at that port's office (alongside its berth or anchored in its bay: `cargoPortAt`). One at a time; late or abandoned, it's failed (−6 reputation).
  - **Upgrades:** each is a flag checked where it acts.
    - Radar: plotter echoes of debris and floating crates within 2.8 km.
    - Heavy towing post: break force ×1.75.
    - Bigger trawl: fill ×1.5.
    - Ice machine: fish ×1.3.

    Bought in port, with the money (no credit) and the best port reputation.
  - **UI:**
    - The menu's new **Office** tab: balance, reputation, contract (abandon), job board (accept), chandlery (buy), ledger.
    - The duty board: balance top right, the contract line under the title.
    - A desktop pop-up per ledger entry.
    - All actions are intents (`careerAccept` / `careerAbandon` / `careerBuy`), so crew-mates can use them too.
  - **Tests (5):** cargo pay by distance and the reputation pay factor; fuel billing, oil and lost cargo; a contract taken only at its port, counting only matching work, the bonus, and failure when late; upgrades gated by port, reputation and money, then fitted; save/load round trip and junk rejected.
  - **Not yet:** phase 2 (damage and wear) and phase 3 (tutorial, save slots). The money values are a first guess: tune them in `CONFIG.career` after playing.
- **Cabin light: off / white / red** (owner: too bright at night). `Toggle` takes an optional third position: each press steps 0 → 1 → 2 → 0, and the bat sits middle, forward or aft. The cabin lamp's red mode is a dim red point light (`cabinLight.redIntensity` 0.45 against 3 for white) with a red diffuser. The chart table gets only a little light from it. Changing colour costs no shader recompile, only switching on or off does. **Tests:** the 3-way cycle; the red state through the intent.
- **Desktop players walked off while working a control** (owner feedback: the skiff, searchlight, fire monitor):
  - Clicking a joystick or the tiller already hands WASD to that control, and in tests (host and crew-mate) the player stays put while steering.
  - But dragging a control with the mouse (the skiff's gear lever, the throttle, the wheel) left WASD walking. Now nothing walks while the mouse holds a control, dragging or steering.
  - A click on the skiff's gear lever now takes the whole outboard into keyboard steering (W/S work the gear and throttle through neutral, A/D the tiller), the same as clicking the tiller (`Control.steerOwner`).
  - **Test (1):** the gear-lever click starts steering the tiller.
- **Two side missions: log salvage and fishing** (owner request). Both are original designs: log salvage is in the spirit of salvaging timber off beaches, and the fishing is a simple arcade-style trawl.
  - **Log salvage** (`salvage/`):
    - **Beach spots**, computed once from the terrain (271 of them): marching out from each island's centre along bearings to the shoreline, keep the spot 3 m inland if it's 0.05–1 m up, not a cliff, with 2.2 m of water 20 m off, and 300 m from ports.
    - **Spawning:** logs wash up every 4–9 min (up to 3, at least 500 m from the boat) with a VHF notice, and show as LOG on the plotter.
    - **On the towline** (`l:<id>`, line 30 m, attach 30 m), a log is a point mass of 1500 kg. Beached, it doesn't move until the pull beats mu_s m g (0.55: about 8 kN); sliding, mu_k = 0.4. It floats once the ground is 0.4 m under; afloat, it has water drag like debris and drifts with the wind off the line. Dragged by one end, it swings into line.
    - **Selling:** afloat and slow in any port for 5 s, it's sold (radio, `salvage.sold`). Unvisited logs expire after 30 min.
    - **Hook:** desktop can click a log up to 30 m off (the line is thrown); the hook doesn't telescope out to it.
    - **Duty board** job "Log salvage". Tests → Side jobs → Log on beach.
  - **Fishing** (`fishing/`):
    - **TRAWL switch** (console, where WINDOWS was). The net shoots in 10 s and hauls in 12 s.
    - **Drag** while it's out: (600 + 1000 |v|) v N at the stern, scaled by how far out it is (about 3 kN at 3 kn). Fouled (trawled in under 7 m of water), 9000 |v| plus a 6 kN hold astern, until hauled.
    - **Catch:** in a ground (three in config, with richness), at 1.0–2.1 m/s, the net fills over 40 s / richness. Each fill puts a fish box (cargo kind 'Fish box', `from: 'trawl'`, `to: 'any'`) on the aft deck. Landed at any goods stack, it's counted (`fishing.landed`).
    - **Shown:** status line (why not catching), plotter rings, duty board job "Fishing: trawl".
    - **View:** quarter gallows and winch (merged, one draw call). Rope-free warps (two straight line segments) and seven orange floats (instanced) on the surface astern. An A-frame over the transom was tried first, but it clashed with the skiff on her davit.
  - **Multiplayer:** both states travel in the snapshots (the client now copies `salvage` and `fishing`).
  - **Tests (6):** beach spots valid; a log made fast, pulled off under power, floats and is sold; logs wash up by themselves with a radio notice. Trawl catches in a ground at speed, drags, hauls; nothing slow, fast or outside, fouling in the shallows sticks until hauled; a box landed at any stack counts.
- **Tow anything in the water** (owner request):
  - The towline is now its own state (`TowState.line`, keyed `v:<vessel>` / `d:<debris>`), no longer part of the tow job. It goes on any vessel afloat other than ours, at her bow eye; a tender on her davit doesn't count. It also goes on drifting debris.
  - **Debris on the line** is a point mass (900 kg) with linear and quadratic water drag (`tow.debris`), pulled by the same spring-damper line. Its usual drift still applies, like a current. Towed slowly into a port for 5 s, it's removed and counted (`TowState.cleared`).
  - **Hook:** it now finds every tow point within 40 m (bow eyes and debris; debris is a bigger target). The menu's Make fast takes the nearest within range, the job's tow first. Crates stay on the boat hook.
  - **Tests (2):** debris follows on the line and is cleared in harbour; the skiff on her davit isn't towable, but afloat the menu makes fast to her and casts off.
- **Anchor sound** (`audio/anchorAudio.ts`), driven by the chain's movement:
  - paying out: a link clank per 6 cm over the roller (a rattle at 2 m/s), and a splash as the anchor goes in;
  - heaving in: the windlass motor (a buzz around 90 Hz) with slower, heavier clanks;
  - stowing: a clunk.
  - Level by distance to the hawse, muffled in the wheelhouse.
- **Wildlife** (`wildlife/`): pure functions of world time and the boat's pose, so no network state and every crew-mate sees the same animals.
  - **Gulls:** 6 circle their own wandering centres about the boat, banking into the turn and gliding with now-and-then flapping. They call every 4–12 s (a synthesised falling "kee-ow").
  - **Dolphins:** a pod of 4 in 60 % of 5-minute slots, staying 70 s, when she's under way above 2 m/s in water over 12 m deep, 500 m from ports. They arc out on their own breathing rhythm with a blow sound.
  - None at night. Three instanced draw calls; no physics or particles.
  - **Tests (2):** gull bounds and determinism; pod frequency and duration, the breathing fraction, staying off the bow.
- **Controls hard to use for crew-mates joining** (owner feedback; the host tests in VR, the crew on desktop):
  - **The main cause:** the desktop view's comfort coupling (0.3) holds the view mostly steady while the boat moves, so the console swung under the reticle. For a joining player, whose boat arrives as 20 Hz snapshot steps, the camera moved about ±0.2 m and 3° against the console in a moderate sea; small switches slid in and out of reach.
    - Now, in the wheelhouse or with the reticle on a control, the desktop view eases to riding rigidly with the boat over 0.5 s (`comfort.desktopRigidAtControls`, `desktopRigidTime`). Measured after the change: no camera movement relative to the console, on the host or a client.
  - **Switches bounced on clients:** a click flipped the switch, then the next snapshot (sent before the host had the click) flipped it back, then on again a moment later. A crew-mate would click again and turn it off. Toggles, the lever and the wheel now wait up to `interaction.pendingMs` (800) for the host's state to show their own change (`Control.markPending` / `awaiting`).
  - **Desktop aim help:** a reticle that just misses picks the nearest control within 2.5° (`desktopAssistDeg`). A control under the reticle stays picked until the aim is 5° off it (`desktopStickyDeg`); a direct hit always wins.
  - The boat you're on is posed for the frame before its controls are hit-tested (they were a frame behind).
  - **Tests (2):** a client's switch doesn't bounce back, follows someone else's change at once, and gives up if its change never arrives; the aim help picks a near miss, is sticky, and lets go when well away.
- **Twisted side rails** (workboat and skiff): `bar()` in `vessel/view/hullMesh.ts` turned each box onto its segment with a shortest-arc rotation. That leaves the roll arbitrary, and with the stations running aft-to-fore against the box's +z it came out near 180°, so each bulwark plate and rail segment lay rolled its own way. Bars now keep their height side vertical.

- **Paper chart easier to read, printed-chart look** (owner request: desktop players had to crouch or lean in to read it):
  - **Bigger type:** all text is sized in chart points (1/1280 of the chart's width, about 0.5 mm on the table) at roughly twice the old size. Names and labels carry a thin paper-coloured halo so they read over tints and grid lines. The texture is 2048 px wide (was 1280) with anisotropic filtering at the GPU's maximum.
  - **Bigger chart:** the chart table is 10 cm deeper (`chartTable.x1` -0.72 → -0.62), so the chart is about 17 % larger (0.77 × 0.69 m). The pen holder and lamp moved aft, clear of it.
  - **Desktop reading zoom:** with the crosshair on the chart from within 1.5 m, the view eases in ×1.7 (`desktop.chartZoom`, `chartZoomReach`, `chartZoomRate`), as if leaning over it, and back out when you look away. The look slows to match. It uses `camera.zoom`, so it doesn't fight the binoculars (field of view). There is no change in VR.
  - **Printed look, same geometry:** the same terrain samples and the same `chartBounds()` mapping, so pencil marks stay where they were.
    - Buff land with darker high ground, green drying banks at the tide line, blue depth tints (0–2, 2–5, 5–10 m) with a contour line at each tint edge.
    - Soundings thinned over the even deep floor and kept off names.
    - Port names on the water side of their island; small islands named beside them.
    - A graduated neat-line border in tenths of a minute (black and white, for the dividers).
    - A full compass rose numbered every 30°, and a double-ruled title block.
    - **Finish:** paper grain, two fold creases and edges darkened by handling.
  - **Cost:** about 180 ms to draw once at load, the same as before. The pixel finish was first written per pixel (7 s in a headless browser) and is now done with canvas compositing: a 256 px noise tile and gradients. Still one draw call.

## Release: Workboat World v1.0

**Renamed for players:** the game is now **Workboat World** wherever players see a name: the browser tab (`index.html`), the menu header (`ui/mainMenu.ts`), the README title, and the hull study page. Kept as SWVR on purpose: the repository and live URL (renaming the repo changes the address), the browser save keys (`swvr.*`: career, settings, chart marks, volumes; renaming would lose everyone's saves) and the multiplayer room ids (`swvr-room-*`; old and new builds couldn't meet).

The owner declared this point **v1.0 of the game, "Workboat World"** (after the mooring cleats), before the next big step (modular boats). It is marked in git with the tag **`V1.0`** (capital V; the owner made it on GitHub, on commit `7859f27`, the release notes): a permanent bookmark that later work doesn't move. Its game code is that of commit `f630834` (the cleats) plus the player-visible rename. Claude's sessions can only push to their own branch, not tags, so the owner makes any later tags (e.g. `V1.0.1` for fixes).

Release notes (players' summary, also the text for the GitHub Release): `docs/RELEASE_NOTES_v1.0.md`.

How to come back to it:
- **Look at or download it:** on GitHub, the repo's Tags list has `V1.0`, with a zip of the code as it was.
- **Work from it in a session:** ask Claude to "check out V1.0" (`git checkout V1.0`), or to start a branch from it (`git checkout -b <name> V1.0`), for example to fix a bug in v1.0 alone.
- **Undo everything after it** on the dev branch: possible, but ask Claude first; it's a big step and it's better done as a new commit that restores v1.0's files than by rewriting history.
- The live site follows the dev branch, so after later pushes it shows the newer game, not v1.0.

### Fixes after V1.0 (on the dev branch; not in the `V1.0` tag)

- **Lifting a hooked crate aboard in VR; no strobes on crates** (owner test):
  - **The bug:** you could hook a floating crate and bring it alongside, but not lift it aboard. The lift needed your free hand within 1 m (horizontally) of the crate, but the crate rides at the end of the 2.2 m pole, well out from the rail, out of any arm's reach. The old test only passed by putting the hand 2 m outboard of the rail.
  - **Now** (`rescue/rescueHands.ts`), with the crate alongside, either works:
    - grip the hook's **pole** with your other hand, anywhere along it;
    - or reach over the side towards the crate and grip: within `CONFIG.rescue.liftHandReach` (new, 2.2 m) of it horizontally, and above it. A hand across the deck doesn't count.
    
    The alongside hint says so. Desktop, and the menu's **Lift crates**, unchanged.
  - **No strobes on crates** (owner: too easy to find). Survivors keep theirs; `rescue.strobe*` now apply to survivors only.
  - Tests (`tests/recovery.test.ts`):
    - the VR lift with a hand a player can reach beside the hook hand (it fails with the old rule);
    - a hand on the pole;
    - nothing from across the deck, or with the crate still out.
- **Every crate and pot job by hand, or by one click in the menu** (owner: all jobs with crates and pots should be either manual, carried to the place with friends to help, or quick by a menu button, which matters for a phone version one day).
  - **The buttons** (menu → Cargo; `mainMenu.ts`, handler `App.quickJob`). The handler checks what would happen first: it says what's being done, or why not (not at a port, not stopped, nothing waiting, nothing in reach, potting off). Then it sends an intent and the host applies the same rules as by hand.
    - **Load** (`cargoQuickLoad`): at a port (alongside its cargo berth or anchored in its bay, under `cargo.maxSpeed`; `cargo.ts quickPort`), everything waiting there for another port goes onto the aft deck, while the payload, slots and deck room allow (`stowOnDeck`). Each item is lashed where a D-ring is in reach.
    - **Unload** (`cargoQuickUnload`): everything aboard for this port or any harbour is delivered and paid as if carried to the stack: port cargo, trawl fish boxes, crates fished out of the sea. Pots with a catch have it sold (`sellPotCatch`, shared with setting a pot down ashore) and stay aboard.
    - **Lash all / Release all** (`cargoQuickLash` 1 / 0).
    - **Lift crates** (`crateQuickLift`, `rescue/recovery.ts`): during a lost-cargo call, crates floating within `rescue.quickLiftRange` (15 m) of the hull come aboard, lashed, while there's room, with no boat hook. Bring her closer for the rest. All aboard ends the rescue as before.
    - **Pots** (`potting.ts applyQuickPotting`):
      - **Load pots** (`potQuickLoad`): the pallet's pots aboard, at Calder Haven only.
      - **Bait all** (`potQuickBait`).
      - **Shoot one** (`potQuickShoot`): a pot from the deck lands `potting.quickShootOff` (3 m) off the starboard side. It's shot and soaks like any other; the message reminds you to mark it on the chart.
      - **Haul nearest** (`potQuickHaul`): the nearest buoy that's up within `potting.quickHaulRange` (25 m) of the hull. Its pot lands on deck with its catch.
  - **Fair with the hand way:** a quick job takes no less boat handling. You still steam there, come alongside or anchor, stop, and find the buoy. Only the walking and carrying is skipped, and the pay is the same. The hand way stays the shared crew job it was.
  - **Tests** (`tests/quickJobs.test.ts`):
    - nothing loads at sea; at Calder everything waiting goes aboard lashed; release and lash all; unloaded at a destination it's delivered and paid;
    - crates alongside lifted in one go but not one 60 m off, and the rescue ends once that one is brought close and lifted;
    - pots loaded from the pallet, baited, two shot on a ground, nothing to haul while sinking, both hauled once soaked, the catch sold at Calder with the pots kept aboard.
  - **Checked in headless Chromium:** at the Calder berth, Load, Load pots and Bait all from the menu handler put 5 cargo items and 5 pots on deck, all lashed; screenshot of the Cargo tab with the new rows.
  - **Not covered yet:** the skiff (beach deliveries at anchorage ports, which the quick Load/Unload stand in for when anchored in the bay) and survivors in the water (not crate or pot jobs).

- **Potting: the catch stays in the pot and is sold ashore** (owner, from the milestone 3 screenshots: no two-step of opening the pot and tipping it into a crate; haul it, take it back, sell it; and show the crabs inside the pot).
  - **No opening, no catch crate:** the intents `potOpen` and `potEmpty`, the catch crate (`from: 'potcatch'`) and the open-pot drawing are gone, and so is `PotContents.open`. A hauled pot lands on deck with its catch in it (and a note of what's in it for the player who hauled it, `potHands.ts announceLanded`).
  - **Seen through the netting** (`cargoView.ts potGeometry`): the pot's netting is now an open lattice of cords and hoops over a dark floor instead of a solid half-round, so the crabs, lobsters and bycatch drawn on its floor show through. This applies to every pot.
  - **Selling** (`cargo.ts cargoPlace`): set a pot down ashore at a harbour, either within `cargo.deliveryRadius` of a port's goods stack (where trawl fish boxes are landed) or of the pot pallet. The catch is sold and the pot stays there empty. Pay is new career job kind `catch`, priced per animal (`potting.price`: lobster 40, crab 8), times the port's usual reputation pay factor, with fish-landing reputation. The bycatch is thrown away. `potting.crateCapacity` is gone.
  - **Bait** works on any pot not yet baited, catch in it or not. Shooting a pot that still has a catch in it lets the catch go (the pot is a fresh record in the water).
  - **Tests:** the crate test is now "the catch stays in the pot; set down on the Calder quay it's sold, the pot stays there empty, and the ledger line reads '1 lobster, 3 crabs sold at Calder…'".
  - **Checked:** typecheck and all tests; screenshots of a hauled pot on deck with two lobsters, four crabs and a starfish showing through the netting, from above and from the side.

- **Lobster and crab potting, milestone 3 of 5: hauling and the catch** (owner: "go ahead with milestone 3").
  - **Hook** (`potting/potHands.ts`, intents in `potting.ts applyHaulIntent`): with the boat hook in hand, its tip within `potting.haul.hookReach` (0.95 m) of a buoy hooks it (`potHook`; desktop: click the buoy). The buoy follows the hook tip in (`potTow`, sent every 0.1 s as hooked crates are). It's kept 0.25 m outside the hull, on the side it started (`outsideHull`), so a hook tip swung over the deck can't drag it through the boat. Let go of the hook and it comes off (`stepPotting`).
  - **Aboard** (`potAboard`): within `haul.liftRange` (2.5 m) of the hull, the other hand gripping over the buoy (desktop: a click, which also puts the hook back in its clips) brings it over the gunwale. The line now leads in at the nearest point of the gunwale (`leadFor`), with the depth plus `haul.slack` (1.5 m) of line out. The pot stays on the bottom, dragged along under the boat if she moves.
  - **Haul** (`potHaul`): grip the line (VR: near where it comes over the side, a haptic tick when your hand is on it) and pull. Any stroke away from where the line leaves the water, up or in, counts in full, times `haul.pullScale` (1.6). It's sent in 0.15 m chunks, and the rest of a stroke when you let go. Desktop: `haul.deskPull` (2.5 m) a click, so about eight clicks from 20 m. At no line left the pot lands on deck next to where it came in (`landPot`), as a pot cargo item carrying its catch. With no room on deck it goes back down.
  - **The swell rule:** with significant wave height over `haul.slipFrom` (1 m), stop pulling for `haul.slipAfter` (1.5 s) and the line slips back out at `haul.slipRate` (0.6 m/s per metre of swell over), up to the full depth. This is the brief's "let go at the wrong moment and the pot drops back", made gradual so it reads as weight on the line, not a reset.
  - **The catch** (`catchFor`, fixed when the pot comes up): expected = ground quality (`offGround` 0.15 off any ground) x soak factor x bait (`catch.unbaited` 0.35 without) x weather (`catch.roughFactor` 0.7 in wind over `roughWind` 11 m/s). Each of up to `lobsterMax` (2) lobsters (at 0.8 of that) and `crabMax` (6) crabs is there with that chance. A `catch.bycatch` (0.25) chance adds a small fish, a starfish or, `bootChance` (0.12) of those, an old boot. The random draw is seeded from the pot's id and shot time, so every peer agrees.
  - **Working the pot** (`cargoHands.ts` via a new `potAction` callback; VR trigger with a hand on the pot, desktop click):
    - **open** (`potOpen`): the door shows the catch, with a note of what's in it;
    - **tip it out** (`potEmpty`): crabs and lobsters go into a catch crate (`from: 'potcatch'`, a Fish box kind, `item.catch`), one with room for `potting.crateCapacity` (12) or a new one beside the pot; bycatch goes back;
    - **bait** (`potBait`): from the **bait tub** at `potting.baitBox`. VR: grip the tub for a piece of bait and let go over an open, empty pot. Desktop: click the tub, then the pot; any other click drops it. A baited pot catches more next time (`ShotPot.baited`, carried through `shootPot`).
    - While a pot has work to do, the VR trigger does that work instead of lashing it and the desktop click does it instead of picking the pot up. Once it's emptied (and baited, if you have bait in hand), the trigger lashes and the click picks it up as before. Desktop lashing stays on Q throughout.
  - **Selling, for now:** a catch crate is `to: 'any'` and pays as a box of fish (`earn 'fish'`) at any harbour. Lobster and crab prices are milestone 4.
  - **Views:**
    - **The line being hauled** (`potView.ts`): the buoy sits on the gunwale where the line comes in; the line runs out to the water and down. The pot shows for the last metres: under the surface, then out, hanging from its bridle, swinging and dripping (a few points falling) on its way up the side. One extra instanced pot mesh, one line and one points object, all drawn only while a line is in.
    - **Open pots and the catch** (`cargoView.ts`, `potting/catchGeometry.ts`): an open pot with one side of the netting folded down flat and its coil and buoy set aside, so you see in. Brown crabs (about 0.15 m across), blue-black lobsters (about 0.3 m) and the bycatch (a small fish, a starfish, a boot) lie on its floor, and the crabs and lobsters in the catch crates (an empty wooden fish box). Each kind is one instanced mesh, drawn only when there's some to show.
    - **The bait tub:** a blue tub with its lid half off, merged into one mesh on the workboat's deck.
  - **Debug** (Missions → Potting): **Full** (`potDebugReady` value 2) makes every pot in the water baited and soaked its best.
  - **Tests** (`tests/potting.test.ts`): hooked, drawn alongside, aboard, hauled hand over hand onto the deck with its catch; can't be drawn through the hull; opened, tipped into a catch crate, baited and catching more; the hook let go unhooks it, and in a heavy swell an idle line slips back.
  - **Checked in headless Chromium:** the desktop path end to end (hook, draw in, aboard, eight clicks of hauling, open, tip out, bait), the VR line pull with simulated hand frames (0.5 m strokes haul 0.8 m), and screenshots of the pot hanging on its line at the side, the open pot with crabs, a lobster and a boot, the catch crate and the bait tub. **Not checked:** VR hooking and the over-the-side grip with real controllers. Those need the owner's Quest.
  - **Not yet:** prices and selling at the fish quay, pots saved across sessions, the lost-pot grace period and the propeller rule (milestone 4); duty board items, sounds and the multiplayer test (5).

- **Lobster and crab potting, milestone 2 of 5: chart marking, soak, the ready cue, storm drift** (owner: keep it on the main game behind the setting).
  - **Soak in play time, not the game's clock:** the time of day stands still by default (`environment.timeScale` 0), so "one in-game day" would never pass. Soak is world time from when the pot reaches the bottom (`potting.ts soakOf`): ready after `potting.soakReady` (1200 s, 20 min), improving to `soakBest` (2400 s), then flat (`soakFactor`, for milestone 3's catch). Tunable.
  - **Ready cue** (`potView.ts`): the flag is red (`flagSoaking`) while soaking and green (`flagReady`) when ready, and a small light blinks on the pole top at night on a ready buoy. Both show only within `cueRange` (45 m); further off the flag is a dull grey.
  - **Storm drift** (`stepPotting`): in wind over `dragFrom` (11 m/s) a pot drags downwind at `dragRate` (0.004 m/s per m/s over). A squall's 17 m/s is about 1.5 m a minute. It stops where the water's under 1.5 m, and its ground id follows it.
  - **A local on the VHF** (`stepPotting`): every `tipEvery` (15-25 min, the first after `tipFirst` 4 min once potting is on), a potter (one of a few original boat names) says there's good crab or lobster off one of the grounds.
  - **Grounds on the chartplotter** (`chartPlotter.ts`): hatched orange rings named "(pots)" while potting is on. Casual mode `potting.showOnPlotter` (default off) also shows your pots as dots; the debug **On plotter** toggles it.
  - **Pot markers on the paper chart** (`chart/chartTools.ts`, `chart/marks.ts`):
    - A tray of little red crab magnets sits by the pen holder. A marker shows a small number: the next free one when taken from the tray.
    - **VR:** grip the tray to take one. Grip a marker on the chart to move it. Let it go over the chart and it snaps on; off the chart, it comes off.
    - **Desktop:** click the tray, click the chart to put it down, click a marker to lift it, click the tray to put it back. The click that takes or places a marker never starts a pencil stroke.
    - Markers are a new part of the shared chart marks: `ChartMarks.tokens`, with ops `token` (put or move) and `untoken`, at most `MAX_TOKENS` (40). They're relayed and joined like the pencil marks and saved with them in the browser. The eraser's clear-all leaves them: they're magnets.
  - **Debug** (Missions → Potting): Ready (`potDebugReady`), On plotter.
  - **Tests** (`tests/potting.test.ts`): ready after the soak, the catch factor capped at the best soak, debug ready; dragged downwind in a squall (about the expected distance) but not in a breeze; the local's tip names a ground.
  - **Not yet:** hauling and the catch (milestone 3); selling, persistence across sessions, the lost-pot grace period and the propeller rule (4); duty board items, sounds and the multiplayer test (5).

- **Lobster and crab potting, milestone 1 of 5: pots as cargo, and shooting them** (owner's feature brief: a slow-burn potting loop over several voyages; milestones 1 pots and shooting, 2 chart marking and soak, 3 hauling and catch, 4 selling, persistence and propeller rule, 5 multiplayer and polish).
  - **Where it's built:** the dev branch, behind a per-browser setting that's off by default (**Settings → Game → Potting**, `userSettings.potting`), not on `next`. `next` carries modular-boats commits that aren't on the dev branch, so pushing a potting milestone there would have overwritten them. With the setting on, the host (or a lone player) switches potting on in its game (intent `pottingOn`). With it off, the game is unchanged.
  - **Data** (`potting/potting.ts`, `WorldState.potting`, plain JSON, host-authoritative):
    - **Pots** are cargo items of a new kind, `Pot`: 24 kg, 0.75 × 0.42 × 0.5 m, 2 skiff slots, `from: 'pots'`, `to: 'none'`. They carry, stow and lash like any cargo, are never trade cargo (`cargo.tradeKinds` limits what spawns at the goods stacks) and aren't counted against a port's stack.
    - **The pallet** (`potting.pallet`) is on the Calder Haven quay by the fuel berth. Five pots (`potting.pots`), topped up there whenever pots are lost (pots are free for now).
    - **Shooting:** a pot set down in the sea becomes a shot-pot record (owner boat, x, z, shot time, baited, ground id) and the cargo item goes. While it soaks there's no mesh, just the record. Capped at `potting.maxShot` (24) in the world. In water under 1 m, or past the cap, the pot is lost. Lost overboard loose, it's a lost pot with no career penalty, and a new one appears on the pallet.
    - **Potting grounds** (`world/archipelago.ts POTTING_GROUNDS`): circles with a quality (0..1) on rocky edges in 6-25 m of water:
      - the south side of Gull Rocks;
      - the east side of the Skerry;
      - Craig Bheag;
      - Tarran north point.
  - **Desktop throw** (`cargoHands.ts putDown`): a pot set down with a click while looking out over the water is thrown `potting.deskThrow` (1.4 m) out the way you look, so it can be shot from the rail. In VR you hold it out past the gunwale and let go, which is the existing set-down rule: outboard of the hull it goes in the sea.
  - **Views:**
    - **The pot** (`cargoView.ts potGeometry`, one instanced mesh): a creel with a base frame, a half-round netted body over three hoops, a rope bridle, the coiled line and an orange buoy with a pole.
    - **Buoys** (`potting/potView.ts`): three instanced meshes for all buoys (float in the boat's colour `potting.buoyColors`, pole, flag `flagSoaking`), riding the drawn waves with a tilt from the slope, no physics body. Shooting shows a spreading splash ring and a bubble trail for `potting.sinkTime` (2.5 s); then the buoy pops up.
  - **Debug** (Missions → Potting): Pots aboard (intent `potDebugAboard`), To a ground (`potDebugGround`).
  - **Tests:** `tests/potting.test.ts`:
    - off until switched on, five on the pallet, never trade cargo;
    - carried, lashed and shot on a ground, with the buoy up after the sink time;
    - let go in the shallows: lost and replaced;
    - the grounds are in 5-30 m.
  - **Not yet** (next milestones): the grounds on the chart display, chart marker tokens, soak time and the ready cue, storm drift, hauling and the catch, selling, persistence across sessions, the propeller rule, duty board items, sounds.

- **Cargo crates flicker fixed; the trawl's catch in wooden fish boxes** (owner):
  - **Flicker:** the upper pale band on every crate had its top face flush with the crate's lid, so the two fought for the same pixels (z-fighting). The band now sits just below the lid (`cargo/cargoView.ts`).
  - **Fish boxes:** fish from the trawl (`from: 'trawl'`) are drawn as open wooden fish boxes: two slats a side, darker corner posts, a bed of ice only with the Ice machine upgrade (career upgrade `ice`; without it the fish lie on the bare boards; the boxes switch as soon as it's bought), and six fish filling its floor (three rows across, two head to tail in each; owner: they were bunched in the middle) as plain blocks with a tail, in cod grey, mackerel blue, haddock brown, gurnard red and whiting silver. One more instanced mesh, one draw call while there are any. They brighten when a hand is on them, as other cargo does. Port cargo of the "Fish box" kind still looks like a crate in its port's colour, so the colour-to-port cue isn't lost.

- **Avatar hands as simple woollen mitts** (owner: the hands still looked bad; keep it simple and line it up with the VR controllers). The palm block, knuckles and thumb stick in `net/avatarOutfits.ts gloveGeometry` are replaced by three rounded parts, laid out in the controller's grip frame (WebXR grip space: the handle runs along z through the fist, -z forward, +x to the player's right):
  - one mitt lump closed round the handle, a little toward the back of the hand;
  - a thumb lobe on top on the inner side, lying forward along the handle;
  - a darker ribbed cuff at the wrist, back and a little down, where the sleeve meets it.

  Checked by rendering both mitts on a stand-in controller handle from the player's view, from the front and from the side.

- **Night red automatic; start-up card moved; labels tilted** (owner):
  - **Red at night by itself:** the panel lighting turns red as night falls, between darkness `panelLighting.redFrom` (0.55) and `redTo` (0.85). The NIGHT switch is gone (`panelRed` control and `bridge.nightPanelSwitch` removed). The Cabin and WIPERS switches are back where they were (x -1.14 and -0.99).
  - **Start-up card** (`bridge.checklistCard`): moved from the dash top to the console's upright aft face below the ENGINE group, facing the helmsman. It's on the panel lighting now, so it dims and goes red at night like the voltmeter instead of glowing white.
  - **Labels tilted 45 degrees toward the helmsman:** the dash switch and button labels (`bridge.ts buildLabels`) and the warning-lamp names (`ignition.ts`). Each stands on its near edge, with nothing behind it.

- **No glass in the doors** (owner): the aft door and the port side door lose the faint pane in their window openings (`controls/WheelhouseDoor.ts`). The opening and frame stay. Shut, the doors still keep the wind, rain and engine noise muffled: that comes from whether the door is shut, not from the pane.

- **Torch on the water; extinguisher spray animated and heard** (owner testing):
  - **Torch:** the sea now has its own pool for your torch (ocean shader `uTorch*`, `OceanView.setTorch`; it falls off over about 18 m). Before, it shared the searchlight's single slot and only got it while the searchlight was off. The beam is narrower, sized for a person 5-6 m off: `handGear.torch.angleDeg` 11 → 7 (a pool about 1.4 m across at 6 m), with a softer edge and a shorter visible cone.
  - **Extinguisher spray animated** like the monitor's jet (`player/gearView.ts`): each segment's width pulses, droplets are scattered round the arc and re-scattered every frame so it shimmers (one small points cloud), and a splash pulses where it lands. The fire's smoke turns to white steam when the extinguisher hits it, as with the monitor.
  - **Extinguisher sound** (`audio/fireAudio.ts`): a "pssht" as the valve opens, then a fluttering rush while it sprays. It's full loudness for your own and falls off with distance for a crew-mate's, and stops when it's empty. The steam sizzle, the "on target" cue, now sounds for extinguisher hits too.

- **No fake radio voice on the Quest** (owner: the synthetic babble sounded fake). Where the browser can't speak (the Quest browser has no voices), the radio no longer babbles a voice-like sound. You hear the static burst as the call comes in and the squelch's click and hiss as it ends; the words are on the radio screen and in the notice. On desktop the browser's speech still reads the calls out (`audio/radioAudio.ts speak`). The survivors' shouts in the water still babble where there's no voice (`audio/rescueSounds.ts`); not changed.

- **Hand gear: binoculars on the mouse, a fire extinguisher and a torch** (owner request):
  - **Binoculars (desktop):** hold the **right mouse button** to look through them (Z still works). Over the chart, a right-drag still erases. The **laser pointer moved to the middle button**. In VR they were already there (grip them on the dash, raise them to your eyes); the grab reach went from 14 to 20 cm (`binoculars.grabRange`) so they're easier to pick up.
  - **One "hand gear" system for the extinguisher and torch** (`player/handGear.ts`):
    - They hang on brackets low on the wheelhouse aft wall, starboard corner (`handGear.extinguisher.bracket`, `handGear.torch.bracket`).
    - **VR:** grip to take; it stays in the hand while you hold the grip, and goes back when you let go. The trigger works it.
    - **Desktop:** click to take; the left button works it; click the bracket or press U (`hangGear`) to hang it back.
    - What it does is shared: the nozzle or lens and its direction go out with your pose (`PlayerState.avatar.gear`, `PlayerPose.gear`, checked by the host). Crew-mates see your gear, spray and beam (`player/gearView.ts`), and a crew-mate's gear is missing from its bracket.
  - **Extinguisher** (`fire/extinguisher.ts`):
    - The spray is modelled like the monitor's jet, smaller: it leaves at `nozzleSpeed` (9 m/s), with gravity and `airDrag` (0.6/s), and carries 5-6 m.
    - Where it passes through the fire (the same hit test as the monitor, `fire.ts arcWetting`) it knocks the fire down at `douse` (0.8) × the monitor's rate. It works on boat fires alongside and on shed fires ashore.
    - A charge lasts `seconds` (60) of spraying (`VesselState.extCharge`). Hung back on its bracket it's full again.
    - Drawn as one small instanced arc, one draw call.
    - In solo play the simulation now also reads your hand gear (it previously only read crew-mates' poses).
    - Test: `tests/extinguisher.test.ts` (puts a shed fire out from 9 m; runs empty, refills on the bracket; falls short from 20 m).
  - **Torch:**
    - A real spotlight from the lens (`handGear.torch`: half-angle 11°, intensity 260, reach 45 m), only for your own torch. Crew-mates' torches show their beam cone only, so there's never more than one extra light.
    - With the searchlight off, the torch also takes the sea's one spotlight pool, so it lights the water.
    - **Cost:** the light is in no shader until first switched on (one recompile then, as with the searchlight). Lit, it costs roughly what the searchlight does. In headless software rendering, frame time went up 5-13 % with it on (noisy). Check it on the Quest with the perf panel's GPU ms. `handGear.torch.realLight: false` turns it into a beam only, at no lighting cost.

- **Deck gate** (owner request: easier access to the skiff alongside with cargo; "at least the railing could open with a button press"):
  - A gate in the starboard bulwark and rail at the fore end of the working deck (`layout.sideGate`: z 2.6 to 3.4, between the midship cleat and the swim ladder). It's hinged on its forward post and swings 90° inboard (`openDeg`) over about half a second, eased.
  - Worked by green push buttons on the aft gatepost, one facing inboard and one outboard (`buttonHeight` 0.85 m above the deck). Vessel control `sideGate` (1 open); it starts shut.
  - The bulwark and rail have a gap there, with a post at each end (`hullMesh.ts buildDeckFittings`). The gate is its own small mesh (`controls/SideGate.ts`). A fixed boarding step sits on the hull side `stepDrop` (0.55 m) below the deck.
  - **Walking:** open, the gateway is walkable out to the deck edge, and the VR fence lets you through to it (`WalkArea.setGateOpen`). From there you jump down into the skiff.
  - **Boarding:** jump at the open gate from the skiff (or from anywhere within `boardRange`, 1.8 m, outboard of it) and you land on deck just inside it (`player/body.ts updateAir`). Jumping out through it from the deck isn't pulled back.
  - To clear its swing and the gateway, the fender basket moved forward (`fenders.basket` z 2.4 → 1.95) and the aft pair of fenders aft (`fenders.z` 3.4 → 3.9).
  - Test: `tests/sideGate.test.ts`.

- **Skiff painter and midship cleats** (owner: launched on a windy day, the skiff blew away):
  - **The painter** (`vessel/physics/painter.ts`): a bow line from a cleat on the skiff's stem head to one of the ship's cleats. Modelled like the towline: a rope that only pulls, taut a spring-damper between the two cleats (`docking.painter.stiffness` 3000 N/m, damping 0.7 of critical on the two boats' reduced mass). It parts above `breakForce` (15 kN) or stretched `maxStretch` (2 m).
  - **On launch** she's made fast to the nearer forward cleat (the starboard one: the crane sets her down off the starboard bow), at the distance plus `slack` (0.5 m), between `minLength` 2.5 m and `maxLength` 7 m. Hoisting her back lets it go.
  - **Her bow cleat** (a clickable cleat on her stem head) lets go, or makes fast to the nearest of the ship's cleats within `reach` (6 m).
  - **Midship cleats** (`mooring.cleatMidZ` 2.0, both sides, at the fore end of the working deck): for the painter only. Click one to lead the painter there (her bow within reach), click again to let go. The forward and aft cleats still work the mooring lines; they show the painter's turns when it's on them.
  - Drawn as a sagging rope like the towline (one instanced mesh, one draw call; `vessel/view/painterView.ts`). Its state is on the tender (`TenderState.painter`), so crew see it too.
  - Test: `tests/painter.test.ts` (held in a 14 m/s beam wind, blows away without it, led amidships, let go on hoisting).
  - Not changed: launched alongside a quay on the starboard side, the skiff is set down under the quay edge, as before. Launch with the quay to port, or off the quay.

- **Anchor scope** (owner: too much chain, ~30 m in 3 m; 5:1 minimum, 7:1 recommended): the windlass now pays out `anchor.scopeRatio` (5) × the water depth, never less than `anchor.minScopeFromRoller` (3) × the bow roller's height above the seabed, so it still holds in very shallow water. It was 4 × (bow roller height above the seabed) + 5 m. That counted the roller's 1.35 m and added a flat 5 m, and the echo sounder reads under the keel (keel 0.95 m down). So "3 m" on the display was about 4 m of water and 5.3 m from the roller: 26–30 m of chain. Now it's 20 m. Set `scopeRatio` to 7 for the heavy-weather figure. Test: `tests/anchor.test.ts`. **The golden run `tests/golden/fixtures/anchor.json` was re-recorded** (`GOLDEN_RECORD=1`) for this deliberate change; the other golden runs are unchanged.

- **Charted hazards and IALA buoys; night instrument lighting; stabilisers only in use** (owner request):
  - **Old buoys and rocks gone:** the yellow/red buoys and loose rocks the traffic system scattered about (unlit, marking nothing) are removed (`traffic.buoys`, `traffic.rocks` deleted).
  - **Real dangers** (`world/archipelago.ts`):
    - the wreck *Margaret Ann* (`WRECKS`): a 30 m coaster lying at 55° list, hull top 0.9 m above the water (wheelhouse, funnel and mast showing). Its seabed is a hidden ridge (`RidgeDef.drawn: false`), so she grounds you like rock and shows on the chart's depths;
    - Dubh Sgeir, a reef awash (a ridge, crest 0.4 m);
    - Craig Bheag, a 1.2 m rock (an islet).
  - **Buoys** (`MARKS`), IALA region A: N and S cardinals on the wreck, W and E on Dubh Sgeir, W and S at Gull Rocks, W at the Skerry, an isolated danger mark on Craig Bheag, and a port/starboard pair at the Calder entrance. Shapes, colours and topmarks are the IALA ones. Lights flash the IALA characters (`world/navMarks.ts`), staggered so like buoys don't flash together. Drawn as one instanced mesh per kind plus one points cloud for the lamps (`world/view/navMarksView.ts`): a handful of draw calls for all of them. The paper chart and the plotter show the marks (with characters) and the wreck symbol.
  - **Night panel lighting** (`controls/panelLighting.ts`): every dial, screen and label shares one brightness setting in its shader, so it costs nothing per frame. It dims with darkness to `panelLighting.nightLevel` (0.3). A new **NIGHT** switch on the console (`controls.panelRed`, `bridge.nightPanelSwitch`) turns it red at `panelLighting.redLevel` (0.6) of that. The Cabin and WIPERS switches shifted a little to port to make room; NIGHT sits where WIPERS was.
  - **Stabilisation only in use:** the searchlight holds its aim only while lit, and the fire monitor only while the pump runs. Otherwise they ride with the boat and skip the per-frame correction.

- **Wheelhouse sides and a port side door** (owner sketch):
  - **Raised side wall by the console:** from the front back to the console's aft edge the side windows' sill is raised to the console top (`wheelhouse.sideRaise` height 0.95 above the floor, to z -1.32), sloping back down to the normal sill over 0.35 m (a wedge). Both sides; on the port side it runs into the door's forward jamb.
  - **Sliding door in the port wall** between the console and the chart table (`wheelhouse.sideDoor` z -1.12..-0.37, 2.0 m high): the aft door's panel (`WheelhouseDoor`, now taking its control key) turned to slide aft along the outside of the wall, a threshold, a header and jambs. Green push buttons on the forward jamb inside and out (`DoorButton`, key `sideDoor`). Vessel control `sideDoor` (1 open, optional in the state: absent = shut), shut at the start. Walking: a doorway strip joins the wheelhouse floor to the port side deck (`layout.ts`); desktop walking is blocked while it's shut (`App.withDoor`); the collision test treats the doorway as open. The wheelhouse counts as shut-in (muffled engine, wind, rain) only with both doors shut.
  - Test: walking out through the side door onto the side deck; the doorway open, the wall beside it solid (`tests/layout.test.ts`).
  - Fix (owner feedback): a slot of window showed beside the dash between the raised side wall and the raked corner post; the post below the front sill is now as deep as the raked cheek's foot, so they meet flush.
- **Pilot-house front windows** (owner request): the front glass now starts level with the top of the instrument dash (`layout.wheelhouse.frontSill` 1.36 m above the floor; the side windows keep their 0.75 m sill) and leans forward 22 degrees from there (`frontRakeDeg`; first 12, raised on the owner's sketch; 0 gives an upright front). Owner feedback on the first try: starting the rake at the old sill made the glass long and it met the skiff's outboard; from the dash top it's shorter and clear.
  - Done as a shear (`hullMesh.ts frontRake`: each point moves forward by its height above the front sill x tan(rake)), so the sill and head stay level and only the band above the sill leans: the two mullions, the panel above the glass and the front corner posts (deepened into a solid cheek so they still meet the upright side walls). The front wall below the new sill is solid and upright. A **brow** carries the roof edge forward over the raked glass (~0.32 m at 22 degrees).
  - The **rain glass and wipers** take the same shear (`rainGlass.ts`); the wipers are shortened to the shorter panes (`rain.wiperArm` 0.42, `wiperBlade` 0.36, were 0.6).
  - Walk/collision test (`layout.ts`): the front wall counts as solid up to the new front sill.
  - Nothing else moved: console, dash, side and aft walls, roof, floor and walk areas are as before.
- **Crew-mates as working figures** (owner: upper body only, with a random selection of fisherman and workboat clothing; steps B and C of the avatar plan):
  - **Figure** (`net/avatarView.ts`, sizes in `CONFIG.avatar`): head; a torso hanging from the neck to the waist (no legs), turned toward where they look but lagging (`bodyTurnRate`) and never twisted more than `maxTwistDeg`, leaning when the head is off the feet (`lean`); two-part arms whose elbow is found from the shoulder and the hand (two fixed-length bones, law of cosines, bent down/out/back). A desktop hand on a far control stretches the forearm (the old rubber band). An untracked hand hangs relaxed.
  - **Looks** (`net/avatarOutfits.ts`): six original outfits (yellow oilskins and sou'wester; orange float coat and beanie; navy jumper and flat cap; hi-vis vest, work blues and hard hat; green bib-and-brace over a check shirt; red crew jacket and cap), five skin tones, beards in four colours or none. The host picks a random `PlayerState.look` for each player as they join (and for itself); everyone decodes the same figure. The player's colour shows on the hat and collar. Older hosts send no look: it's derived from the id.
  - **Faces** now have eyes and a nose instead of the dark visor, so you see which way someone looks.
  - **Cost:** 8 meshes per crew-mate (head, torso, 2 upper arms, 2 forearms, 2 gloves), one shared vertex-colour material: about the same as the old figure. Not a single skinned mesh as first proposed: rigid parts were simpler and cost the same with a few players.
  - Tests: `tests/avatarBody.test.ts` (torso on the neck, leaning; elbow joints and reach; untracked hands hang; far desktop reach stretches; every look decodes and builds).
- **Avatar head no longer floats off the body** (owner bug; step A of the avatar plan). Two causes, both fixed:
  - **The pose sent the comfort-softened view.** With motion coupling below 100 % (the desktop default on deck), our camera lags the boat's roll and heave a little; 2 degrees at 1.6 m is 5-6 cm, and that was sent as the head position. Now `updateNetPose` sends the head and VR hands relative to the rig's carrier, put back on our feet unrotated against the deck: what a rigid view would show. Our own view keeps its comfort. The desktop hand (on a control) is unchanged.
  - **The body was placed on its own** (70 % of the head's sideways offset), so any offset left a gap. Now the torso runs from the feet to a neck right under the head (`NECK_DROP` 0.13 m), leaning with it, and the shoulders hang from the neck (`net/avatarView.ts`). Test: `tests/avatarBody.test.ts` (the old body left a 9.5 cm gap there).
- **Fire missions: better feedback** (owner request). Four cues, where you look and listen while aiming:
  - a **fire gauge** on the SEARCH · FIRE plate just ahead of the MONITOR joystick (`fire/fireGauge.ts`, `fireMonitor.gauge`): a FIRE bar as long as the fire is big (red, orange, yellow as it dies) and an **ON TARGET** lamp, green while the jet lands on it. Two small draw calls; the track is baked with the console.
  - a **steam sizzle** where the jet lands (`audio/fireAudio.ts`), loud enough to hear from the helm (falls off far more gently than the roar);
  - **coastguard progress calls** on the VHF: first water on it, under half, nearly out (`fire.progressCalls` [0.5, 0.2]; `FireJob.said`);
  - the existing white steam and status line.
- **Fewer calls and slower weather** (owner: too frequent), all in config:
  - `tow.every` 480-1080 s (was 240-540), `fire.every` 600-1320 s (was 300-660), `rescue.chance` 0.35 per cargo run (was 0.5);
  - an unanswered call rings every 20 s, not 10 (`callRepeat`, rescue / tow / fire);
  - `weather.hold` 480-1200 s (was 240-600; squalls unchanged); `weather.forecast.every` 720 s (was 360).
  - **Emergency calls: On / Off** in the menu's Voyage tab (`world.quietCalls`, intent `quietCalls`): off, no new rescue, tow or fire calls start; one already ringing runs its course. Shared with the crew (it's in the world). Per session, not saved. Test: `tests/quietCalls.test.ts`.
- **Avatar hands you can read** (owner: so other players see the hands turn). The VR pose now sends each hand's orientation (`PlayerPose.leftQ/rightQ`, `avatar.leftQ/rightQ`; optional, so older versions still join). Other players' hands are a gloved fist with a thumb on top and a wrist cuff (`net/avatarView.ts` `handGeometry`), not a sphere, turned as the real hand is. Desktop players' hands face where they look.
- **Desktop help panel off by default and trimmed** (owner request): it starts hidden (H or F1 shows it; `debug/helpPanel.ts`). It now lists only the playing keys: what the menu already does is left out (time of day N/M, weather L, motion coupling 9/0, sea trials T, drop R / heel K tests, buoyancy V and wave probes P; those keys still work). Added the keys it was missing: jump (Space), lash (Q), binoculars (Z). The VR line no longer mentions X + stick for motion coupling (it's in Settings → Comfort). Slightly tighter spacing so it fits a 720-px-high window.
- **Trawling speed easier to hold** (owner: the trawl speed was hard to reach, she was too fast). Measured with the net out: she made 3.0 kn idling in gear and 4 kn by 23 % lever, so the 2-4 kn window was only 8-23 % of the lever (a quarter of a second on the desktop keys). The net was too light (3.5 kN at 3 kn). Now:
  - net drag tripled (`fishing.dragLinear` 1800, `dragQuad` 3000: ~10 kN at 3 kn, so the engine works when trawling); fouled drag raised to stay well above it (`foulDrag` 18000);
  - the window's top raised from 4 to 4.5 kn (`fishing.maxSpeed` 2.3 m/s); the status line now shows the window from the config (`trawlKnots`).
  - Result: idle in gear ~1.9 kn, 2 kn at 12 % lever, 4.5 kn at ~65 %. Half the ahead travel is good trawling. The lever itself is unchanged (so driving feels the same).
  - Test: with the engine driving and the net out, idle is at the bottom of the window and 20 %, 35 % and 50 % lever are all inside it.
- **Stabilised searchlight** (owner: it needs the same motion compensation as the fire monitor): `spotlight.stabilised: true`. The lamp holds its aim against her roll and pitch: pan is still from the bow (turn her and the beam turns), elevation from the horizon. It uses the monitor's maths (fire.ts `monitorAim`), applied in the view (`vessel/view/searchlight.ts`, as MonitorView does), since nothing in the simulation depends on where the beam points. Test (`tests/searchlightStabilised.test.ts`): rolled 15 deg, pitched 8 deg or both, the beam points within half a degree of where it does level, and a change of heading turns it.

## Planned next (owner requests, not started)

1. ~~Fuel and oil temperature~~ **Done** (see above).
2. ~~VR menu~~ **Done**. New settings go in `ui/mainMenu.ts` via `MenuHost`.
3. ~~Missions and game loop~~ **Done**: rescues, tows, fires, salvage, fishing, cargo runs, the career layer (money, reputation, contracts, upgrades), damage and wear, and the first-voyage tutorial (see above).

- **Menu tidied for playing** (owner request: cluttered, debug tools mixed in with play):
  - **Tabs:** Voyage · Boat · Cargo · Office · Crew · Settings, plus Debug, which is hidden until **Settings → Game → Debug tab → Shown** (`userSettings.debugMenu`, per browser, off by default).
  - **Sections:** tabs can now hold sections, picked from a second, flatter bar under the tabs (`MenuPage.sections` in `ui/menuPanel.ts`). Each tab remembers its section. Hidden tabs drop out of the bar, and the others widen.
    - Office: Jobs / Yard / Career (the old Office and Career tabs).
    - Settings: Comfort / Sound / Game.
    - Debug: World / Boat / Missions / Views (the old Tests tab, plus the cheats from Sea & time: weather presets, sea state, move to a port, board or leave).
  - **Voyage** (new; replaces Sea & time):
    - the job on (contract, run or rescue status, **Abandon**) and the totals done;
    - the weather over two rows (it was one squeezed line) and time of day ±1 h with time flow;
    - port bearings and ranges (no **Go**; that's in Debug);
    - the chart's marks with **Clear marks**.
  - **Boat:** the deck jobs together (tow make fast / cast off, docking, anchor), then skiff, fuel and the FM radio (moved from Sound).
  - Plot-it-yourself rescues moved to Settings → Game as **Rescue position: On plotter / Plot it yourself**.
  - **Tests (2 new):** sections and the hidden Debug tab; the weather line split. Existing menu tests now look buttons up by tab.

- **v1.0 start: in harbour, no start platform** (owner request, near-final changes before v1.0):
  - **Removed:** the pile-mounted start platform and its ring of floating buoys at the origin (`app/testScene.ts`, the platform walk area, `testScene.platformDeckHeight` / `platformHalfSize`). The hazard buoys (traffic) stay.
  - **New game:** `createWorld(..., { harbour: true })` (the game; tests still start her at sea at her `spawn`) puts the workboat moored alongside the Calder Haven cargo berth, her lines already fast (`CONFIG.start.berthId`), and you on the quay beside her facing her (`CONFIG.start.quay`, `placeAshore`). B / left stick click "go ashore" puts you there too.
  - **Crew joining** a game now come aboard the workboat at her boarding spot, wherever she is (they used to appear on the platform).
  - **First voyage** reworked for it: step aboard from the quay, master on, INSTR breaker, start her, load a crate (you're at the cargo berth), cast off and go out between the breakwater lights, deliver it. Tests: the start, and the new walk-through.

- **Mooring cleats instead of the DOCK button** (owner request, last change before v1.0):
  - **Four horn cleats** on the bulwark tops, forward and aft on each side (`vessels.workboat.mooring.cleatFwdZ` -4.3, `cleatAftZ` 4.4; controls/deckGear.ts `Cleat`, vessel control `cleat`, value = which cleat: 0 forward port, 1 forward starboard, 2 aft port, 3 aft starboard). The blue DOCK button, its label and `bridge.dockButton` are gone.
  - **Each end on its own** (`MooringState.bow` / `stern`: 0 not fast, else the side of the cleat it's on). In a berth's hot spot, a forward cleat sends the bow line to the berth's forward bollard, an aft cleat the stern line to the aft one (`toggleCleat`). Click a fast cleat again to let that line go; with neither fast she's free. With one line only she stays "docking" and hangs off it; with both fast and settled she's moored (same spring-damper lines as before, now pulling at the cleats' stations).
  - The cleat's rope turns show while its line is fast; the lines run from the cleat to the bollard (`MooringLines`, bollards at `BOLLARD_HALF_SPACING` either side of the berth). Out of reach of a berth, a click says "No bollard in reach".
  - **Menu Dock / Cast off** still does both lines at once (on the quay side). A moored state with no ends recorded (old saves, the start at Calder, the port shortcut) means both lines fast on the quay side.
  - Tutorial and README docking text updated. **Test (1 new):** one cleat, then the other, moored; let go one, then the other, free; out of reach, nothing.

- **Stabilised fire monitor** (owner feedback: very hard to keep the jet on a fire as she rocks and rolls): `fireMonitor.stabilised`. The aim (fire.ts `monitorAim`) uses only her heading, not her roll and pitch: pan is still from the bow (turn her and the jet turns), elevation from the horizon. Only the nozzle's position moves with the roof. MonitorView draws the barrel at that held aim in the boat's axes (from her drawn pose each frame), so you see the mount working. Test: rolled 15 deg or pitched 8 deg, the jet lands within 3 m of where it does level.

- **Fold-out chart table** (owner request: with the logbook gone the table was too big):
  - **Drop leaf:** the table is now a leaf hinged along the port wall on a wooden batten, shortened to fit the chart and pen holder (`chartTable` z 0.1-1.05, was 0.08-1.4; 75 cm deep as before). Unfolded, a gate leg under its inboard aft corner holds it up. A press on the knob on its inboard edge (`ChartLeafHandle`, vessel control `chartLeaf`, 1 unfolded / 0 folded, shared in multiplayer) folds the leg up along the underside, then lets the leaf down to hang flat against the wall, chart facing into the wheelhouse (still readable). About a second each way.
  - **Same chart maths:** everything on the leaf (chart, pen holder, dividers, and the chart tools and pencil marks, which App now puts in `ChartTableView.leafFrame`) sits in a frame that is the table's own frame while unfolded. `chartToTable` and friends are unchanged. Drawing (desktop and VR) and the desktop reading zoom work only unfolded (`isOpen`); folded, the marks fold with the chart.
  - **Lamp on the wall:** the lamp's stand is gone. A bracket on the wall above, with the arm reaching over the chart's middle (`lamp.base` is the bracket); its switch is on the batten's aft end.
  - **Walking:** folded, the floor in front of it is free (`WalkArea.setChartLeafFolded`, set by App each frame); the layout test covers both.

- **Winch pulls straight away; engine under a floor hatch** (owner feedback):
  - **Winch:** it did change the line's length, but a line was made fast at the full default length (22 m) whatever the distance, so a tow 15-20 m off hung on metres of slack and heaving in only took that up for many seconds: it looked like nothing happened. Now a line is made fast at the distance from the stern roller to what it's on plus `tow.winch.makeFastSlack` (1 m), inside the winch's limits (`newLine` in tow/tow.ts), so heaving in brings her in at once. The winch test checks the tow comes closer.
  - **Engine hatch:** the waist-high engine casing (in the way) is gone. In the wheelhouse floor, aft to starboard, is a hatch (`layout.engineHatch`: x 0.42-1.2, z -0.18-0.76, engine space 0.85 m deep), hinged on its outboard edge. A press on its yellow lifting ring swings it up against the starboard wall (`engineHatch` control, 0/1, shared in multiplayer).
  - **Under it:** the floor has a hole with a steel coaming, and a painted engine space below, with the engine in it: bearers, sump, green block and head, rocker cover with the yellow oil filler cap, air filter, fuel filter, alternator, exhaust manifold and riser, flywheel housing. All of it is baked into the bridge's one static mesh (no extra draw calls). The dipstick is on the engine's inboard side; the oil can sits on a shelf on the outboard wall (`maintenance.engine`, `dipstick`, `filler`, `oilCan`, `shelfDrop`). Both only work with the hatch open (`Control.enabled`).
  - **Walking:** open, the hole isn't walkable (`WalkArea.setHatchOpen`, set by App each frame); standing on it as it opened, you're still held up and just can't step back onto it. Shut, you walk over it.
  - The oil-check duty now says "Open the engine hatch (wheelhouse floor, aft starboard) and pull the dipstick". Tests: the layout test covers the hatch shut and open.

- **Stern roller instead of the towing post; winch drum only turns under pressure** (owner feedback):
  - **Then simplified** (owner: the closed fairlead's eye looked like a long tube and the line didn't visibly pass through it): a **stern roller** instead. A steel roller across the notch between two upright cheeks, with a plate closing the notch below it. The line runs over the top of the roller (`tow.fairlead` height 0.24, inset 0.03, `rollerRadius` 0.06), so it always visibly bears on it, whichever way the tow lies.
  - **No towing post:** the black post on the aft deck is gone. The towline leads from the winch drum aft through a **fairlead**, a closed steel chock with rounded lips round its eye, set in a notch in the transom bulwark on the centreline (`layout.fairleadGap` 0.44 m; `tow.fairlead` height 0.2 m above the deck, 0.05 m in from the transom). The tow's pull now acts on the boat at the eye (`towPostLocal`), lower and 0.35 m further aft than the old post top. A short length of line from the top of the drum to the fairlead shows while a tow is on (`winchLeadLocal`).
  - **Winch moved aft** to `towWinch.z` 5.3 (was 4.95), into the space the post left.
  - **Drum animation:** it turned whenever a button was held, power or not. It now turns only while the line or the net is really moving: hydraulic pressure, no stall, and inside the winch's limits (App sets `bridge.drumTurn` from the same logic as the machinery sounds).

- **Deck hydraulics: crane, tow winch and net drum need the engine and a breaker; their sounds** (owner request):
  - **Model:** the three deck machines are hydraulic, driven by a pump on the engine's power take-off. `hydraulicsOn(v)` (vessel/electrics.ts) = engine running AND 12 V AND the new **DECK HYD** breaker (`hydraulics` in `BREAKERS`), which feeds the pump clutch and valve solenoids (`electrics.loads.hydraulics` 4 A while engaged).
  - **Without pressure** nothing moves, and a hydraulic machine holds its load on its valves:
    - crane (tenderCrane.ts): won't start; mid-lift, her time on the path stops and she hangs where she is until pressure returns;
    - tow winch (tow.ts `stepTowWinch`): the drum holds;
    - net drum (fishing.ts): a shoot or haul asked for waits (new status `noHydraulics`, "engine running and DECK HYD breaker on") and starts when pressure comes.
  - **Feedback:** the crane's menu line reads "LAUNCH: no hydraulics" / "Stopped: no hydraulics"; pressing any of the machines' buttons without pressure pops a note saying what's missing (start the engine, or the breaker). Quick start also switches DECK HYD on. The breaker panel is now two rows of four.
  - **Sounds** (audio/hydraulicsAudio.ts, synthesised, one voice per machine at its own place on deck, muffled in the wheelhouse): pump whine (pitch with speed, sagging under load), flow hiss (louder under load), the drum or slew gear's rumble with a slow wobble, a valve clunk on start and stop, and the relief valve's high hiss when the winch stalls. Crane pitched highest and lightest, net drum lowest. Fed from the shared state, so crew hear the host's machines.
  - **Tests (3 new, `tests/hydraulics.test.ts`):** the engine-and-breaker rule; the crane refuses, then stops and holds mid-lift and carries on; the net drum waits for pressure. The crane, winch and trawl tests now start the engine first (`tests/helpers/engine.ts`).

- **Hull study: ten workboat types** (owner request, groundwork for modular boats; not part of the game):
  - `src/hulls/` is a lines-plan style hull generator, separate from the game (nothing in the game imports it). A `HullDesign` is a few design curves over the length (half-breadth, sheer, keel profile, rake, chine position and height, flare, bulwark height), each a handful of control points joined by a monotone cubic, plus deckhouse blocks (footprint, height, front rake, window band and pane counts, stacked with `above`). `loft()` makes transverse sections (optionally softened to a round bilge, with a doubled station at a forecastle break), `buildHullMesh()` panels them into one vertex-coloured mesh (plating in three paint bands, deck, bulwarks, transom, houses with proud window panes), and `hydrostatics()` integrates the sections at the DWL: displacement, LCB, LCF, Cb, Cp, Cm, Cwp, KM. **Catamarans:** the curves describe one demihull; two are placed `spacing` apart under a bridge deck with a wet deck at `tunnel` height, and the waterplane inertia gets the parallel-axis term.
  - **Designs** (`designs.ts`, all original, proportions from the type), small to large: Nordic sjark-type netter (11 m), Bay gillnetter (9.75 m), coastal work skiff with a landing bow (9 m, redrawn from the owner's reference photo of an aluminium outboard work skiff), catamaran landing craft (15 m), pilot / crew boat (14 m), compact harbour tug (15 m), 58 ft limit seiner (17.7 m), inland pushboat (20 m), crew transfer catamaran (24 m), multicat (26 m).
  - **Viewer:** `hulls.html` (a second Vite page, deployed at `/SWVR/hulls.html`): tabs for the designs, bow / side / stern / plan views scaled to the boat's length, orbit, the sea at the DWL, a lines overlay and the hydrostatics table.
  - **Square bows:** a section that keeps its width at the stem is closed by a flat, raked bow plate with a bulwark across it (the work skiff, the landing cat's demihulls). Transom and bow-plate fans now close along the centreline at deck height (they left a wedge open).
  - **Owner's shortlist** (marked ★ in the viewer, `shortlist: true`): sjark netter, catamaran landing craft, pilot boat, harbour tug, limit seiner, crew transfer catamaran. The gillnetter, landing craft, pushboat and multicat stay as references.
  - Hull and houses only, by design: deck gear, masts, rails, ramps, push knees and controls come as modules later. The owner's modular-boat plan decides how the section format is used.

## Reference-boat pipeline (owner brief; PAUSED by the owner)

**Paused:** the owner has Claude Cowork doing the photo research and writing the module descriptions, to bring to Claude Code later. Don't build anything for it until then; the proposal's open points still apply when it resumes.

A research side task that doesn't change the game. It turns photos and spec sheets of real boats into hull shells with sockets, and grows the module catalogue (`docs/PIPELINE_REFERENCE_BOATS.md`). The proposal is `docs/PIPELINE_PROPOSAL.md`: folder layout, brief schema, milestones P1-P6 lined up against the modular milestones (the shell generator after M6, modules after M5, recipes after M7). It raises five points for the owner before P1:
- recognisable copies of named products versus the "original designs only" rule (recommended: references set type and proportions; our own names and details);
- reference photos in a private repository (gitignored files don't survive between cloud sessions);
- this environment's network blocks the builder and review sites (allow the domains, or gather by hand);
- the development-only `yaml` dependency (ask-first rule);
- the first boat (the 9 m work skiff would feed M7 directly).

## Direction: one engine, three games (owner plan, not started)

The owner plans for SWVR to grow into three games. Agreed approach: **one repository with a shared core** (physics, boats, sea, weather, tow and rescue rules), not three separate projects and not long-lived git branches, so a physics fix reaches every game at once. Each game is a thin layer on that core and gets its own page from the same build (for example `/SWVR/`, `/SWVR/mobile/`, `/SWVR/free/`).

Order, as the owner set it:

1. **Modular boats, in this game (SWVR), next.** The owner has a detailed technical plan from a separate chat and will bring it in as its own prompt. **Don't design or start this ahead of that prompt.** What is already agreed:
   - It is built here, in the current VR/desktop game, not in a branch-off.
   - Saved boat designs must be usable later in the procedural world (see 3). The saved design file is the one place the two meet, so keep it independent of the world.
2. **Mobile / touchscreen version.** First step done (Oct 2026): touch controls in this app (see "Touchscreen controls"), so the owner can test driving on a phone. No multiplayer from a phone at first (owner). The plan below still stands for the full version.
   - **Collaborative Shipyard (owner idea, Oct 2026; later):** sketch together on a reference boat's side and plan views in multiplayer, slide components in 2D as a mock-up, then build the agreed design. Notes in docs/MODULAR_BOATS.md, M8.
   - **Shipyard (owner, Oct 2026):** boats will be designed in a separate Shipyard web app (hull forms stretched and modified, wheelhouses, engines; later, AI reading a photo). The game's boat shop only upgrades your existing boat. See docs/MODULAR_BOATS.md, M8.
   
   The original notes for the full mobile version:
   - A pure driving game on a phone, with one or two boats.
   - One on-screen stick for the wheel, one for the throttle.
   - Buttons for the deck jobs (connect a tow, recover people from the water), so you never walk outside.
   - You can look around the boat; the joy is the boat physics.
   - Reuses the core unchanged. New work: touch controls, a simpler camera and graphics cut down for phones.
3. **Procedural free mode (later; wait for the owner).**
   - An endless procedurally generated world to sail freely, including in saved modular boats.
   - Bigger than it sounds: today's world is a fixed archipelago, and the paper chart, chartplotter, ports and missions all assume that fixed map. Land and sea floor would have to be generated as you sail, and dropped behind you.
   - It may fit better as a mode inside SWVR ("Free sail") than as a separate page. Decide when it starts.

Before the first branch-off (2 or 3):

- ~~Tag the last version before the split in git~~ **Done**: tag `V1.0` (see "Release: Workboat World v1.0").
- ~~Write a `CLAUDE.md`~~ **Done**: the owner's standing rules, commands, code layout and this direction, read by every session.
- First round: separate the shared core from the VR/desktop-specific parts, plus an empty mobile page that drives the boat with two sticks. No visible change to SWVR.

## Future roadmap (owner notes, not started)

3. ~~Archipelago with ports~~ **Done** (see above). Still open from the original notes:
   - ~~**Walking ashore**~~ **Done** (see above).
   - ~~**Mooring lines**~~ **Done** (docking puts bow and stern lines ashore).
   - **Breaking waves** on beaches.
4. ~~**Dynamic weather**~~ **Done** (presets that change, wind and leeway, fog, rain and squalls, forecasts). The original notes follow.
   - `EnvironmentState` already holds the sea state (wave components) and time of day. Add wind (speed, direction), visibility (fog density), cloud cover and rain intensity.
   - A slow weather simulation interpolates between weather presets, building and decaying the wave components, which are scaled from a target Hs and Tp. A JSONSWAP-style fit is possible later.
   - **Wind on the boat:** windage force and moment on the topsides and wheelhouse (projected areas from the layout).
   - **Visuals:** sky and fog palette darkened by cloud, rain particles (one draw call), whitecaps on the ocean shader.
   - Host-authoritative like the rest of the environment, so all players see the same weather.
5. ~~**Map and charts**~~ **Done** (the chartplotter, the paper chart with pencil marks, the NAV / WIND display). The original notes follow.
   - A chart display (canvas atlas page) rendered from the world registry: coastlines, depth contours, ports, buoys, plus own-ship position, heading and track history. It could be a chartplotter screen on the dash, a paper chart on the chart table, or a page on the wrist menu.
   - GPS position in the vessel state (already known: world position). Waypoints and a course-to-steer readout could feed an autopilot later, which would just be another intent source driving `helm`.

6. **Exhaust smoke driven by load and engine temperature.** *Done* (owner request).
   - Smoke leaves through a low transom outlet, starboard, just above the DWL (`exhaust.position` / `direction`), so it's visible when backing up. The cooling-water spray was tried and then removed at the owner's request.
   - **Smoke:** dirty grey-brown diesel haze even at idle, denser and darker with load, a black puff on fast throttle-up (turbo lag), black when labouring, and a start-up burst.
   - **When the outlet is under a wave:** the smoke bubbles up at the surface.
   - **World-space particles:** under way the plume trails astern; going astern you back into it. 1 draw call.
   - **Cold white smoke:** done with the thermal model. Wind drift still needs weather. The original notes follow.
   - A small particle system at the exhaust outlet (funnel or stack on the wheelhouse roof): one instanced or Points draw call with a soft sprite.
   - **Driven by the engine state:**
     - Emission rate and opacity from the fuel rack (load), with a dark puff when the rack rises quickly (turbo lag; `rackRiseRate` already models it).
     - Black smoke when overfuelled at low RPM (heavy prop load, bollard).
     - White/grey vapour when cold (low coolant temperature, from the planned thermal model).
     - Thin and clear when warm at cruise.
     - A burst at start-up.
   - **Movement:** particles drift with the apparent wind (boat velocity plus the planned weather wind), so smoke streams aft under way.
   - **Performance:** cap at about 100–200 particles; fade with distance.

## Decision: ocean masking inside the hull (deferred)

The deck and wheelhouse floor are opaque and sit well above the DWL (freeboard about 0.95–1.5 m), so the sea can't show "through" the boat. The only remaining case is green water overtopping the bulwark in big rolls, which is physically what happens; it would need a "freeboard volume" mask to hide. I'll revisit in the polish pass if it's visible in practice. It matters for a future open well-deck or a low-freeboard rescue boat.

## Modular boats (owner brief, in progress)

The aim: rebuild the boat as reusable modules on a hull, so a new boat is mostly a hull plus a recipe. The first result is invisible: the starter boat assembled from a recipe and playing exactly as in v1.0. The proof is the landing craft costing almost no new logic. Plan, contracts and milestones: [`docs/MODULAR_BOATS.md`](docs/MODULAR_BOATS.md).

**Owner decisions:**
- **Landing craft:** the 9 m landing-bow work skiff from the owner's photo (hull study `landingCraft`), with a single inboard diesel.
- **Saves:** only hull damage and engine wear carry over, as today.
- **Order:** prove the system on the workboat, then on the landing craft, then add parts. Electric drive, shore power, generator, solar and hybrid come after M7.
- No objection to the departures from the brief in the plan's section 2:
  - a module has a simulation half and a view half;
  - the bus is polled, not notified;
  - force-producing modules get a physics port;
  - recipes can rebind ports;
  - the energy network is a service;
  - a small mechanism library is extracted in M5 (none exists today);
  - switches are drawn as instanced parts.

### M1: contracts and the safety net (done, awaiting owner test; nothing visible)

**The contracts,** in `src/modular/`:
- `bus.ts`: the bus, its checks, and `BusWatcher`.
- `busKeys.ts`: THE registry. 88 keys, each with type, unit, range and writer. Each is bound to the `VesselState` field where today's code keeps it (the facade), so nothing else changed. Old channel names are aliases: `lever` finds `throttle.demand`.
- `socket.ts`: socket types and capacities, and `fits()`.
- `module.ts`: the module definition with its sim and view halves; ports, needs and provides, power roles, state migration.
- `hull.ts`: the hull definition, its shape, handling and lightship (M6a) and what's built into her, its `fittings` (M6b).
- `recipe.ts`: recipes, the interlock conditions (`"hatch.engine.open == false && ..."`), the JSON loader, and the validator. The validator answers in sentences such as "engineBay: engine.test is 600 kW; this engine.bay takes up to 450 kW".

**Tests (30 new, `tests/modular/`)** cover:
- the registry: documented, named, typed, sane defaults, unique names and aliases;
- only `hull.damage` and `engine.wear` persist;
- every key reading and writing today's field;
- derived keys: heading, speed, circuits;
- a boat without electrics;
- player intents through the bus: clamped, held controls, refusals;
- `BusWatcher`;
- sockets: type, tags, power, mass, size, load rating;
- every recipe-check error;
- reads with no writer, two writers of one value, and writing a key the boat works out herself;
- needs and provisions;
- the interlock parser and evaluator;
- module state: fresh, migrated, from a newer game;
- port rebinding, a twin-engine boat, recipes from JSON;
- the **module-boundary check**: no module may import another, enforced by a test rather than a lint tool, so there is no new dependency.

**Golden runs (12, `tests/golden.test.ts`, fixtures in `tests/golden/fixtures/`).** Scripted sessions on today's boat, each recording the pose, velocities, every bus key and a few world values every 2.5–10 s:
- cold start by the card;
- full ahead and a hard turn;
- crash stop;
- docking at Calder Haven;
- anchoring in Selkie Bay;
- the crane launching and recovering the skiff;
- towing the barge and heaving in on the winch;
- trawling (a box of fish comes aboard);
- a boat fire put out with the monitor;
- battery drain with everything lit, then charging;
- under way in a moderate sea;
- the skiff on her outboard.

Every later milestone must reproduce them to a millionth. The trawl run was re-recorded after merging the dev branch's trawl change (heavier net drag, 2–4.5 kn window); she now tows at about 2.6 kn. A 0.1 % change to the engine's friction fails 10 of the 12 (checked). Re-record only for an intended change in behaviour: `GOLDEN_RECORD=1 npx vitest run tests/golden.test.ts`.

**Baseline to beat** (headless Chromium, `scripts/measureDraws.mjs`; four viewpoints aboard; noise ±2 from passing ships and birds):

| Viewpoint | Draw calls, day (cold boat) | Draw calls, night (all lit) | Boat parts drawn (in the wheelhouse) |
|---|---|---|---|
| Helm, looking forward | 67 | 66 | 144 (92) |
| Chart table, facing port | 46 | 47 | 144 (92) |
| Aft deck, looking forward through the door | 120 | 121 | 112 (61) |
| Aft deck, looking aft | 33 | 32 | 112 (61) |

"Boat parts drawn" is a new debug overlay line (`debug/boatParts.ts`): every separately drawn mesh, line or sprite on the boat. From outside, the wheelhouse's small parts are hidden, so it depends where you stand.

**Measured: the moving-part target is well below today.** The brief's target is under ~15 on the bridge and ~40 on the whole boat. Today it is 92 in the wheelhouse and 144 on the whole boat. Every switch bat, button cap, lamp, label plate and gauge needle is its own object. Getting near the target is the instancing work in M3 (plan 2.10), and it will be measured there.

**Other changes:** `tests/node.d.ts` holds a few lines of Node typings for the file-reading tests (the project has no `@types/node`).

**Owner test:** nothing should be different. Play a few minutes in VR and on desktop. On desktop, F3 shows the new "boat parts drawn" line.

### M2: the throttle lever, the first module (done, on /next/ for the owner to test; nothing visible)

- **The module:** `src/modules/throttleLever/` (`control.throttle-lever`).
  - It is the existing `Lever` control; `controls/Lever.ts` now takes its channel and how it reads its position.
  - It writes one bus key, `throttle.demand`, and doesn't know an engine exists.
  - Its tunables moved to `CONFIG.modules.throttleLever` (travel 40°, length 0.2 m, neutral notch 0.06). `bridge.lever` keeps only where it stands and its pedestal.
- **The boat files:** `src/boats/`.
  - `workboatHull.ts` is the hull `hull.workboat-12m`. It still stands on today's vessel definition and has one socket, `throttle`, at the lever's old place.
  - `starterWorkboat.json` is the recipe, with one mount.
  - `library.ts` lists the hulls and modules, and loads and checks recipes (a bad one throws with every problem listed).
- **The assembler:** `src/modular/assemble.ts` builds each module's view at its socket. The Bridge takes the result:
  - the module's controls join the bridge's;
  - its fixed parts (the lever's quadrant) are baked into the bridge's one merged mesh as before;
  - the Bridge no longer builds a lever of its own.
- **The intent path:**
  - An intent named by a bus key ('throttle.demand') goes through the bus (`applyBusIntent`: range clamp, holds).
  - The old names ('lever' from the keyboard, menus and tests) still go through `applyVesselIntent`'s switch.
  - Holds map to their group, so a hand on the lever holds 'lever' whichever name is used (`holdGroup`, in vesselControl.ts and App's hold rules).
  - The registry marks `throttle.demand` as written by a module.
- **Wheelhouse detail:** `app/interiorDetail.ts` never hides anything that holds the throttle lever. The lever now sits inside its module's group, and stays visible through the windows as before.
- **Debug overlay:** a "modules" line lists what's mounted ("throttle: control.throttle-lever").
- **Tests (10 new):**
  - the recipe is valid and mounts the lever;
  - a bad config is caught in words;
  - the lever stands where it stood, keeps its id and name;
  - it sends `throttle.demand` with the same feel and detent;
  - its intents drive the boat exactly like 'lever' (same rpm and position after 10 s);
  - multiplayer holds by either name;
  - the position round-trips through JSON (save / snapshot);
  - a recipe can wire it to another key;
  - two golden runs (full ahead and turn, crash stop) driven through `throttle.demand` match the recordings exactly.
- **Measured** (headless Chromium, `scripts/measureDraws.mjs`): draw calls and drawn parts **identical to M1** at all eight viewpoints (67 / 46 / 120 / 33 by day, 66 / 47 / 121 / 32 lit at night).
- **Checked in the browser:**
  - the lever works through the game's own interaction path (sends `throttle.demand`, moves the throttle);
  - another player is locked out while we hold it;
  - hold and release work by both names;
  - a screenshot shows it on its pedestal, quadrant drawn, pushed half ahead.
- **Owner test** (at /SWVR/next/, where the menu header says NEXT):
  - **VR:** start her up and drive out of Calder Haven. The lever should feel exactly as before: the neutral click, ahead and astern, grabbing it anywhere on the handle.
  - **Two players:** while one holds the lever, the other's hand glows red on it and can't move it.
  - **Desktop:** click-drag the lever (mouse up = ahead), and the arrow keys.
  - F3 shows "modules 1: throttle: control.throttle-lever".

### M3a: the helm console as modules (done, on /next/ for the owner to test; nothing should look different)

- **What changed:** the helm console and everything on it now come from the boat's recipe instead of being hand-built in `controls/bridge.ts`. The recipe (`src/boats/starterWorkboat.json`, version 2) mounts a console on the hull's `helm` socket, and 22 modules in the console's slots.
- **New modules** (one folder each in `src/modules/`):
  - `console.standard`: the dash, the three pedestals, the coloured group plates and their titles (LIGHTS, SEARCH · FIRE, DECK, ENGINE). Its slots are where the controls stand.
  - `control.wheel`, `control.toggle`, `control.push-button`, `control.key-switch`, `control.joystick`: the existing controls, each told by the recipe which bus key it works ('lights.nav', 'ignition.start', 'monitor.pan'...). One toggle module serves all seven console switches; the recipe gives each its label and key.
  - `instrument.warning-lamps`: reads five new bus keys, `lamp.oil`, `lamp.charge`, `lamp.glow`, `lamp.neutral`, `lamp.bilge` (off / on / blink), worked out exactly as the old lamps were. A boat with another engine can light them her own way.
  - `furniture.start-card`: the laminated start-up card.
  - `instrument.screen`: one module per screen (speed, heading, rpm, rudder, engine monitor on the dash; the NAV / WIND display hung overhead). All six still paint one shared texture, one draw call (`DisplayAtlas`, in `controls/instruments.ts`, replaces the fixed `InstrumentPanel`). A screen is dark when its breaker is off, as before.
  - The throttle lever (M2) now sits in the console's throttle slot instead of a socket of its own.
- **Config:** the console layout moved from `vessels.workboat.bridge` to `CONFIG.modules`:
  - `helmConsole` (`dash`, `pedestals`, `groups`, `plates`, and `slots`: each part's place on the console);
  - `wheel` (rim radius, turns lock to lock), `joystick` (pan and tilt rates; the fire monitor's stick pans at 40°/s, set in the recipe), `warningLamps` (spacing), `startCard` (size), `screen` (dash and hung sizes and tilts).
  - Removed, as now in the modules: `bridge.wheel`, `bridge.lever`, every `bridge.*Switch` and `*Button`, `bridge.keySwitch`, `bridge.warningLamps`, `bridge.checklistCard`, `bridge.spotJoystick`, `bridge.consoleGroups`, `bridge.dash`, `bridge.displays`, the navDisplay's size; `spotlight.panRateDeg` / `tiltRateDeg`; `fireMonitor.joystick` / `pumpSwitch` / `panRateDeg` / `tiltRateDeg`; `fishing.trawlSwitch`.
- **Unchanged on purpose:** every control keeps its id, so multiplayer, the desktop hand, the tutorial and the wheelhouse's hide-from-outside rule know them as before. The keyboard and menus still send the old names; both names do the same thing.
- **App:** the start-in-gear and hydraulics hints also answer to the new key names (`ignition.start`, `trawl.shoot`).
- **Not done here, and why:**
  - The binoculars are a tool the App hands to the player, not a bridge part; they wait for the deck gear (M5).
  - The shared instanced switches move to 3b. Most of the bridge's toggles are on the overhead panel and breaker panel, so that's where instancing saves the most (17 toggle bats into one draw call, once they're all modules).
- **Tests (8 new, 369 in all, all pass):**
  - the recipe is valid and mounts the console with its 22 parts and the nav display;
  - every control stands exactly where it stood (to a micrometre), under the same id, sending a key that means its old channel; the wheel still leans back 22°;
  - the lamps and the card stand where they stood;
  - every engraved label lies by its control as before, and the four group titles are there;
  - the six screens are one mesh;
  - the two joysticks drive their own keys at their own rates;
  - a sequence of console intents by bus key and by old name leave the boat byte-for-byte the same;
  - the lamps read as before (key on, engine stopped: oil, charge, neutral lit).
  - The golden runs were re-recorded only to add the five lamp keys; checked key by key, every other number is identical to the M2 recordings.
- **Measured:** draw calls and drawn parts identical to M2 at all eight viewpoints, measured side by side against an M2 build: 67 / 46 / 120 / 33 by day; 68 / 47 / 121 / 32 lit at night (M2 also reads 68 at the helm at night today; the 66 noted earlier was the same scene at a different moment).
- **Checked in the browser:**
  - close-up screenshots of the console from port, centre and starboard, against the M2 build: the console is pixel-identical (only the rail outside the window differs, as the boat drifts between runs);
  - every switch toggles the boat (key, nav lights, cabin, wipers, searchlight, anchor); the searchlight stick pans it; HEAT and START crank the engine, the same as on M2 (headless runs too slowly for the cold diesel to catch; the cold-start golden run covers a real start); no page errors.
- **Owner test** (at /SWVR/next/, menu header NEXT). Everything on the helm console should look and work exactly as in v1.0:
  - **VR:** a cold start by the card (key, HEAT held, START held; the lamps go out as she runs, START lights green). Every switch on the console, and the labels by them. Searchlight and fire-monitor joysticks (the monitor's turns a little slower, as before). At night, the six screens lit; switch the Instruments breaker off and they go dark. Drive out of Calder Haven on the wheel and lever.
  - **Desktop:** the same by clicking; WASD on a clicked joystick.
  - **Outside:** from the deck or the quay, the console detail is hidden through the windows except the lever, as before.
  - F3 lists "modules 24: helm: console.standard, helm/wheel: control.wheel, ...".

### M3b: the power controls as modules, and shared switch parts (done, on /next/ for the owner to test; looks the same, fewer draw calls)

- **What changed:** the overhead switch panel, the FM set, the breaker panel with its voltmeter, and the battery master and selector now come from the recipe (`starterWorkboat.json`, version 3), on four new hull sockets: `overhead`, `breakerPanel`, `batteryMaster`, `batterySelector`. Only their views and controls: what the electrics do is unchanged (`vessel/electrics.ts`) until M4.
- **New modules** (`src/modules/`):
  - `panel.overhead`: the box under the roof and its slots. The three deck-light switches in it are ordinary `control.toggle` modules, hung upside down. Its legends (FOREDECK, AFT DECK, RAIL, FM, TUNE) are engraved on its underside and now drawn with the bridge's other labels: one draw call fewer, and pixel-identical in the screenshots.
  - `radio.fm`: the FM set (display, power switch, TUNE), in the overhead panel's `fm` slot. The app's player tells the display what it's doing ("NO SIGNAL", tuning) through a new local value, `fm.status`: this player's own, so not on the bus or sent to the crew. The station now plays from the set itself rather than the middle of the panel (11 cm along).
  - `panel.breakers`: the voltmeter, a breaker per circuit and its lamp. Which circuits, where, and their engraving are its config. Its housing is now merged with the bridge's fixed parts: one draw call fewer.
  - `switch.battery-master`, `switch.battery-selector`: the existing controls, wired to `electrical.master` and `electrical.selector`. Their ids are now `batteryMaster` and `batterySelector` (nothing else used the old ones).
- **Shared switch parts** (Part C, 2.10; `src/modular/sharedParts.ts`): every module's toggle bat is drawn as one instanced mesh (18: console 7, overhead 4, breakers 7), and every button cap as another (4: HORN, HEAT, START, TUNE).
  - Each control keeps its own bat, hidden, so it still moves it and your hand or pointer still finds it. Each frame the bat's place, colour and glow are copied to its instance; the upload only happens when something changed.
  - The glow: the hover highlight and the lit START / TUNE buttons. three.js has no per-instance glow, so the shared material adds one in its shader where three adds the material's own.
  - The two shared meshes hide with the wheelhouse's other small parts while you're out on deck.
- **New bus key:** `fm.tune`, the TUNE press: next station, switching the set on if it was off. The old intent name 'fmTune' now runs the same rule. Keys marked `press` do something once and always read their default, so the golden runs don't record them.
- **Labels:** an engraved label can now have its own size, distance from its control, and lie under a panel (`EngravedLabel.size / offset / underside`).
- **Config:** `CONFIG.modules.overheadPanel` (size, `drop` from the roof, slots, legends), `CONFIG.modules.fmRadio` (display size, where its switch and button are), `CONFIG.modules.breakerPanel` (face size, dial, breaker layout, circuits and engravings). The vessel config keeps only where they go: `overheadPanel.position`, `electrics.panel` (position, tilt), `electrics.masterSwitch` and `selectorSwitch`.
- **Removed:** `controls/overheadPanel.ts`. `controls/electricsPanel.ts` became `controls/batteryMaster.ts`, holding only the master switch.
- **Debug overlay:** a "shared parts" line: "18 toggleBat, 4 buttonCap".
- **Tests (9 new, 378 in all, all pass):**
  - the recipe mounts all eight new modules;
  - all 14 power controls stand, face and scale exactly as the v1.0 code placed them (checked against the old construction rebuilt in the test), under their ids, sending keys that mean their old channels;
  - the overhead legends lie where and how they did;
  - 18 bats and 4 caps in two instanced meshes;
  - each instance stands exactly where its hidden bat is, and follows it when a breaker is thrown;
  - the hover glow and START's glow while running reach their instances;
  - the shared meshes hide from outside;
  - the power intents by bus key and by old name leave the boat byte-for-byte the same;
  - a TUNE press steps the station and reads false.
  - The golden runs pass unchanged; no re-recording.
- **Measured** (day / night lit, against the M3a build side by side):

  | View | M3a | M3b |
  |---|---|---|
  | Helm | 67 / 66 | **60 / 59** |
  | Chart table | 46 / 47 | 47 / 47 |
  | Aft deck, looking forward | 120 / 121 | **105 / 106** |
  | Aft deck, looking aft | 33 / 32 | 33 / 32 |

  Boat parts drawn aboard: 144 → 122 (wheelhouse 92 → 70). The chart table gains one by day: the shared bats are drawn whenever any of them is in view. The overhead and breaker panels were never fully in view from the helm, so the gain there is mostly the console's.
- **Checked in the browser:**
  - close-ups of the overhead panel, breaker panel, battery switches and console against the M3a build: identical (only the rail outside the window differs, from drift);
  - the FM display shows its station and "NO SIGNAL"; TUNE glows while the set is on;
  - pressing each control works: master on (12.7 V), selector to BOTH, a breaker on and off, the three deck lights, FM on, TUNE to the next station; no page errors.
- **One visible change, on purpose:** from out on deck, the overhead switches and the FM display, a few pixels through the windows, now hide with the wheelhouse's other small parts, as the console's switches always have.
- **Owner test** (at /SWVR/next/, menu header NEXT). Everything should look and work as before:
  - **VR:**
    - walk to the aft wall: battery master on (the voltmeter needle rises), the selector through 1 / BOTH / 2;
    - at the breaker panel: each breaker off and on, its green lamp going out and coming back; the Instruments breaker darkens the screens;
    - start her: the needle dips while cranking;
    - overhead: the three deck-light switches (the floods and rail lights come on), FM on, TUNE through the stations;
    - hover over any switch or button: it glows green as before; START glows once she runs.
  - **Desktop:** the same by clicking.
  - **F3:** the "shared parts" line, and 32 modules.

### M3c: the rest of the wheelhouse as modules, and the first recipe interlock (done, on /next/ for the owner to test; looks the same, fewer draw calls). M3 is complete.

- **What changed:** the VHF and its handset, the chartplotter, the chart table, the duty board, the whiteboard, the door buttons, the engine hatch cover, the dipstick and the oil can now come from the recipe (`starterWorkboat.json`, version 4), on ten new hull sockets. The whole wheelhouse fit-out is now modules; what's left in the Bridge is the hull's (the door, the windows' rain, the cleats, fenders, swim ladder), the deck machinery (M5) and the engine's look (M4).
- **New modules** (`src/modules/`):
  - `radio.vhf`, `nav.chartplotter`: hung from the roof; their brackets reach the roof whatever the socket's height (a new hull query, `cabinRoof`). Their cases and brackets are now merged with the bridge's fixed parts: two draw calls fewer each.
  - `furniture.chart-table`: the drop-leaf table, its lamp and switch, its leaf knob. It works `chartTable.leafOpen` and `chartTable.lamp`. It declares its **footprint** (the table, or a strip along the wall folded). The walk area still reads the vessel config's table until M6; a test keeps the two the same. Its lamp switch's bat is a shared part, and its plate is merged.
  - `furniture.duty-board`, `furniture.whiteboard`: their frames are merged with the bridge's fixed parts.
  - `control.door-button` (twice, inside and out): throws `door.aft.open`. The door itself is the hull's.
  - `fitting.hatch-cover`: a hatch cover sized by its socket (the hull's opening: the socket now carries its size), throwing the key the recipe binds (`hatch.engine.open`). It engraves ENGINE on the floor.
  - `tool.dipstick`, `tool.oil-can`: throw two new press keys, `engine.oilCheck` and `engine.oilTopUp`. The old names 'dipstick' and 'oilTopUp' now run the same rules.
- **The first recipe interlock** (in the recipe, not in any module): `"hatch.engine.open == false"` disables `control:dipstick` and `control:oilCan`. The assembler applies it each frame from the bus. A recipe whose interlock names a control she hasn't got is refused, in words. (Interlocks that limit a key act in the simulation, from M4.)
- **What the app feeds a module:** the VHF's calls, the chartplotter's chart, the duty board's tasks, the whiteboard's notes and the chart table's pencil are the world's, not the boat's. Such a module hands the app an `api` (`ModuleViewInstance.api`), which the app finds by module id (`AssembledView.api`) and feeds as before. The module never reaches out for it.
- **Kept visible from the deck:** the VHF and the chartplotter still show through the windows from out on deck, as they always did (their screens are lit at night). With their brackets merged away they'd otherwise have counted as small parts and hidden.
- **Unchanged on purpose:** the engine under the hatch and the oil can's shelf stay with the Bridge until the engine is a module (M4). The oil can's control id is now `oilCan` (was `oilTopUp`; nothing else used it).
- **Config:** `CONFIG.modules.vhf` and `chartplotter` (tilt), `chartTable` (size, holder, lamp, switch, from its hinge corner), `dutyBoard` and `whiteboard` (face size), `oilCan` (scale). The vessel config keeps only where they go: `bridge.radio` / `bridge.chart` (position, yaw), `whiteboard.position`, `dutyBoard.position`; `chartTable` stays whole (the walk area reads it until M6).
- **Tests (9 new, 387 in all, all pass):**
  - the recipe mounts all ten kinds; the app finds the five it feeds;
  - the VHF and chartplotter hang where they did, turned the same, their brackets up to the roof;
  - the chart table's chart, pen holder, lamp switch and leaf knob stand exactly where they did (compared with the old table built the old way);
  - its footprint is the walk area's table, open and folded;
  - the boards hang where they did;
  - the door buttons, hatch cover, dipstick and oil can stand where they did, and the floor's ENGINE engraving;
  - the interlock disables the dipstick and can with the hatch shut, not with it open;
  - a recipe whose interlock names a missing control is refused;
  - the wheelhouse intents by bus key and by old name leave the boat byte-for-byte the same.
  - The golden runs pass unchanged.
- **Measured** (day / night lit, against the M3b build side by side; and against v1.0, before M1):

  | View | v1.0 | M3b | M3c |
  |---|---|---|---|
  | Helm | 67 / 66 | 60 / 59 | **56 / 57** |
  | Chart table | 46 / 47 | 47 / 48 | **44 / 45** |
  | Aft deck, looking forward | 120 / 121 | 105 / 106 | **97 / 98** |
  | Aft deck, looking aft | 33 / 32 | 33 / 32 | 33 / 32 |

  Boat parts drawn aboard: 144 (v1.0) → 122 (M3b) → 114.
- **Checked in the browser:**
  - close-ups of the VHF, the chartplotter, the chart table, the aft wall (whiteboard, door button), the duty board and the open hatch with the engine, dipstick and can, against the M3b build: identical (only the scenery outside the windows differs, from drift);
  - pressing each control: with the hatch shut the dipstick and can are disabled; open, the dipstick reads ("oil between MIN and MAX") and resets the oil-check clock, and the can tops the sump up; both door buttons work; the chart leaf folds and unfolds; the chart lamp lights; no page errors;
  - the app found the whiteboard, the duty board, the chart table with its tools, the VHF and the chartplotter.
- **Owner test** (at /SWVR/next/, menu header NEXT). Everything should look and work as before:
  - **VR:**
    - answer a call on the VHF handset;
    - draw on the chart with the pencil, measure with the dividers, fold the leaf and walk past it, unfold it;
    - the chart lamp;
    - open the engine hatch: before it's open, the dipstick and oil can don't respond; open, pull the dipstick, top up from the can;
    - post a note on the whiteboard; read the duty board;
    - the door buttons inside and out.
  - **Desktop:** the same by clicking (and the chart zooms in as you look down at it).
  - **F3:** 42 modules (corrected; 43 was a miscount).

### M4a: the engine, propulsion and the energy network as modules (done, on /next/ for the owner to test; nothing visible, she should handle exactly as before)

- **What changed:** the boat's machinery is now simulated from her recipe (`starterWorkboat.json`, version 5), not from hard-wired code. Nothing looks different; the point is that the engine, the rudder, the batteries and every electrical device are now separate parts a recipe can swap, which the landing craft (M7) and electric drive (M9) need.
- **New modules** (`src/modules/`, simulation only, nothing drawn yet):
  - `propulsion.diesel-inboard`: the diesel, gearbox, shaft and propeller.
    - It handles ignition (key, glow plugs, starter from the bus voltage), the governor and clutch, propeller thrust and torque, fuel and engine temperatures (overheat derate and shutdown, running dry), lube oil use, and engine wear.
    - It declares the alternator (a source) and the starter and glow plugs (loads).
    - It pushes on the hull through the **physics port**, inside the rigid-body step, where the engine always was.
  - `steering.rudder`: the steering gear and the rudder force in the propeller's slipstream, after the engine (it needs this tick's thrust).
  - `fuel.tank`: gives the boat diesel; the engine draws from it, a fuel berth fills it.
  - `electrical.battery-bank`: the two house batteries behind the selector and master.
  - `hydraulics.pto-pump`: the deck hydraulics' pump on the engine's power take-off; its draw on DECK HYD.
  - `pump.bilge`: the float-switch bilge pump; it pumps out what the damaged hull leaks in.
  - `electrical.consumer`: one generic 12 V device, mounted eight times in the recipe (navigation lights, the two floods, rail lights, cabin lamp, searchlight, horn, wiper motor), each with its switch, circuit and draw.
- **The energy network** (`vessel/electrics.ts`, `stepEnergyNetwork`): sums the loads and sources the modules declare (a load counts only with its breaker on), and charges and drains the battery bank. The master, selector and breakers (the circuits) are the network's. The console's instruments, the chartplotter, VHF, FM, chart lamp and the breaker panel itself now declare their own draw too. Only the anchor windlass is still listed in the network, until it's a module (M5).
- **How a tick runs now** (`modular/simAssembly.ts`):
  1. the modules that push on the hull (the engine, then the rudder), inside the hull's step;
  2. the energy network;
  3. the hull's leak into the bilge;
  4. the modules' upkeep (the bilge pump; the engine's oil and wear);
  5. the hull's damage.
- **Exactly as before:**
  - All twelve golden runs reproduce the pre-M4a recordings to the last recorded digit (9 significant figures). The only change is one new value recorded, `propulsion.immersion`.
  - The sea-trials report is identical line for line.
  - The module's loads add up to v1.0's load list exactly, checked over 200 combinations of switches, breakers and engine states.
- **One small change of order, on purpose:** the bilge pump now pumps after the hull's leak, deciding on the level it finds (before, one combined step). It differs only in the tick the water crosses the float switch or the bilge is brimful. No recorded run has water in the bilge.
- **Bus keys:**
  - `engine.*` became `propulsion.*` (`propulsion.coolantC`, `propulsion.wear`, `propulsion.oilCheck`...), the old names kept as aliases.
  - New: `propulsion.immersion` (how much of the propeller is in the water; the rudder reads it).
  - The engine's values, the fuel level, the rudder angle and the bilge level are now marked as written by a module, and the network's values (`electrical.*`, `battery.*`, `circuit.*.live`) as the game's own.
  - Keys that are a press (TUNE, the dipstick, the oil can) are marked so.
- **The key table:** `docs/BUS_KEYS.md` lists every key (values, who sets it, old names, what it is). It is generated from the registry, and a test fails if it goes stale (`KEY_TABLE_WRITE=1 npx vitest run tests/modular/keyTable.test.ts` rewrites it).
- **Config:**
  - The load figures moved from `vessels.workboat.electrics.loads` to the modules that draw them: `CONFIG.modules.helmConsole.instrumentsAmps`, `vhf.amps`, `chartplotter.amps`, `fmRadio.amps`, `chartTable.lampAmps`, `breakerPanel.amps`, `bilgePump`, `ptoPump`, and `dieselInboard` (alternator, starter, glow plugs; `electrics.alternatorAmps` went too). The lights, horn and wiper motor have theirs in the recipe.
  - `electrics.loads` keeps only the windlass.
  - The engine, propeller and rudder data stay in `vessels.workboat` (the modules' defaults) until the boat is built entirely from JSON (M6).
- **Hull sockets:** 14 new ones: the engine bed (tagged inboard), fuel tank, batteries, hydraulic pump, bilge pump, rudder stock, and the eight devices' places. Where nothing is drawn yet, the point is nominal, and labelled so.
- **Until M6:**
  - A converted machine keeps its state where VesselState did (the diesel's is `engine`), so saves and snapshots are unchanged.
  - A few numbers are still also read by code that isn't a module yet: whether the bus is powered (the battery cutoff), the quick start (the engine data) and the windlass's draw. Tests keep each pair equal.
  - The hydraulic pressure rule is still worked out on demand where it was, because the machines ask mid-tick.
- **Removed:** the old hard-wired inboard drive (`stepInboard`), the old load list (`loadAmps`) and the old electrics step; the old `(state, def)` engine functions remain as wrappers for the quick start and the tests.
- **Tests (8 new, 396 in all, all pass):**
  - the recipe mounts the machinery, engine before rudder;
  - the battery module agrees with the vessel's battery config;
  - the network's loads equal v1.0's list over 200 states;
  - the alternator is full from 600 rpm;
  - the separability checks: take a part out of the recipe and only its part goes:
    - no searchlight module, no searchlight draw;
    - no rudder, and she drives ahead but the wheel does nothing;
    - no engine, and the lever does nothing;
    - an engine without a fuel tank is refused, in words.
  - The M4a test list runs on the new modules through the existing tests: the cold start by the card, battery 1 flat and the selector, the pump-failure overheat chain, running dry, deck hydraulics needing the engine and DECK HYD, plus the golden runs and the sea trials.
- **Checked in the browser:**
  - quick start, then lever ahead: 1430 rpm, 43 kN of thrust, gathering way;
  - helm over: rudder 35°, turning;
  - the alternator charging at 14.2 V;
  - no errors (apart from the dev server's missing favicon, as before).
  - Draw calls unchanged from M3c (56 / 44 / 97 / 33 by day).
- **Owner test** (at /SWVR/next/, menu header NEXT). She should feel exactly as before:
  - **VR:**
    - a cold start by the card;
    - drive out of Calder Haven: the lever, the wheel, a crash stop astern;
    - the voltmeter dips while cranking and reads about 14 V running;
    - the crane, tow winch or net drum need the engine running and DECK HYD;
    - with the debug menu: the cooling-pump fault overheats her under load (alarm, derate), and idling saves her.
  - **Desktop:** the same with the keys.
  - **F3:** 56 modules.

### M5a: the deck gear as modules (done; owner-tested in VR on /next/: all the modular work so far works)

- **What changed:** the tender crane (with its cradle), the tow winch, the stern roller, the A-frame, the trawl and the anchor windlass are now modules in the boat's recipe (`starterWorkboat.json`, version 6), not hand-built parts of the bridge and the world's systems. The world's systems no longer read the vessel config for them: they ask the boat for her **gear** ("has she a tow point, and where?"). Take a module out of the recipe and its job goes with it.
- **New modules** (`src/modules/`):
  - `deck.tender-crane`: the knuckle-boom crane on the foredeck with the cradle. Its LAUNCH / RECOVER buttons (column, helm console, the skiff's remote) and the tarpaulin come with the skiff it carries, which the app hands it (a recipe can't know which boat that is). Gives a `tenderCrane`. Needs deck hydraulics.
  - `deck.tow-winch`: the drum, cheeks, gearbox housing and its HEAVE IN / PAY OUT buttons. Gives a `towWinch` (where the line leaves the drum). Needs deck hydraulics.
  - `deck.stern-roller`: the roller in the transom notch. Gives a `towPoint` (the top of the roller, where the tow pulls on her).
  - `deck.a-frame`: the A-frame over the transom with its blocks, and the PAY OUT / HAUL box on the starboard leg. Gives a `trawlGantry`.
  - `fishing.trawl`: the net and warps. Needs a trawl gantry and deck hydraulics; gives a `trawl`. (The net in the water is still drawn by the app: it lies astern, not on the boat.)
  - `deck.anchor-windlass`: the anchor, chain and electric windlass. It holds her to the bottom through the physics port, after the hull's contacts (where the anchor always was), and declares the windlass's 60 A draw while it runs. Gives an `anchor` (the hawse, the chain's length). Nothing new is drawn for it: as before, the chain is drawn from the hawse by the app.
- **Gear** (`modular/module.ts`, `boats/sims.ts` `gearOf(boat, kind)`): each module says what gear it gives and the facts about it, worked out from the hull: `towPoint`, `towWinch`, `trawlGantry`, `trawl`, `tenderCrane`, `anchor`. A module can also *need* gear: the trawl is refused without an A-frame, in words ("needs a trawl gantry (an A-frame), and nothing on this boat gives it").
  - Towing (`tow/tow.ts`): the tug is the first boat with a tow point; the line leads from her tow point; the winch heaves only if she has one.
  - Fishing (`fishing/fishing.ts`): the trawler is the first boat with a trawl; the warps and the net's drag act at the A-frame's blocks.
  - The skiff (`vessel/tenderCrane.ts`): her crane is her ship's `tenderCrane` gear.
  - The app: the sounds (crane, winch, net drum, anchor), the towline's lead, the anchor chain, and the menu's "too deep" all read the gear.
- **Mechanism library** (`src/mechanisms/`), taken out of today's code with the same arithmetic:
  - `arm.ts`: the crane's knuckle-boom solver (law of cosines, knuckle up) and the fold blend;
  - `drum.ts`: a winch drum, where its wire leaves it, and turning it;
  - `line.ts`: bars between two points, rope segments, and a slack line's sag.
  The crane, the towline, the trawl and the chart table's dividers use it.
- **Draw calls down** (the roller, the A-frame and the crane's fixed parts are baked into the boat's one merged mesh; the four deck buttons' caps are one shared mesh). Same four viewpoints as every milestone, M4a → M5a:

  | | helm | chart table | aft deck, facing forward | aft deck, facing aft |
  |---|---|---|---|---|
  | day | 56 → 55 | 44 → 44 | 97 → 95 | 33 → 28 |
  | night, everything lit | 57 → 56 | 45 → 45 | 98 → 96 | 32 → 27 |

  Boat parts drawn: 114 → 108 from the wheelhouse, 89 → 83 from the aft deck.

  The shared parts are now three kinds: `toggleBat`, `buttonCap` (the wheelhouse's, hidden from outside it with its other small parts) and `deckButtonCap` (the deck gear's, always drawn). On the first try the deck buttons shared the wheelhouse's caps and lost them on deck; the screenshots caught it.
- **Bus keys:** `anchor.phase`, `anchor.chainOut`, `anchor.tension` and `anchor.dragging` are now written by the windlass module. The deck buttons send their bus keys (`winch.heaveIn`, `winch.payOut`, `net.payOut`, `net.haul`); the old names (`winchHeave`...) still work.
- **Config:**
  - `CONFIG.modules.anchorWindlass.amps` (60 A): the windlass's draw, moved from `vessels.workboat.electrics.loads`, which is gone. Every load is now a module's.
  - The gear's own figures stay where they were, as the modules' defaults until M6: `vessels.workboat.tenderCrane`, `.towWinch`, `.fishing.aFrame`, `.anchor`, and `CONFIG.tow.fairlead`.
- **Hull sockets:** 6 new: `tenderCrane`, `anchor` (bow windlass), `towWinch`, `trawl`, `sternRoller` and `aFrame` (two stern gantry sockets). The deck gear draws itself in the boat's own axes from the hull (a module "frame: boat"), so these points say where it is, for the shipyard later.
- **Exactly as before:** all twelve golden runs (the anchor, crane, tow and trawl runs among them) reproduce their recordings; the sea-trials report is identical line for line.
- **Until 5b / M6:**
  - The walk area still keeps you out of the winch, the A-frame's feet and the crane's column and cradle from the vessel config (5b: from the modules' footprints).
  - A boat built without the crane has no cradle: her skiff just floats. The shipyard (M8) will need to put a ship's boat only where there's a crane.
- **Tests (12 new, 408 in all, all pass):**
  - each gear fact equals v1.0's geometry (the tow point, the winch lead, the A-frame, the crane, the anchor);
  - every module that gives gear says so in what it provides, and gives just that;
  - take a module out and its job goes: no stern roller, no towing; no winch, the line stays as made fast; no trawl, no fishing; no A-frame, the trawl is refused; no windlass, the ANCHOR switch does nothing and draws nothing; no crane, LAUNCH does nothing;
  - the mechanism library: the arm reaches its target with the right link lengths, knuckle up; the drum's lead; a slack line's sag makes its length.
- **Checked in the browser:**
  - screenshots of the aft deck, the A-frame, the winch, the stern and the crane mid-lift against the M4a build: identical (only the sky and water differ);
  - in play: the crane lowers the skiff; a tow made fast and heaved in (the line shortens, the drum turns, the lead shows); the net jogged out from the A-frame; the anchor let go (chain drawn, the windlass drawing current); no errors apart from the dev server's favicon.
- **Owner test** (at /SWVR/next/, menu header NEXT). Everything should look and work as before:
  - **VR:**
    - launch the skiff with the crane, drive her round, recover her (the remote in the skiff, or SKIFF CRANE at the helm);
    - take the barge in tow: make fast over the stern roller, heave in and pay out on the winch (watch the drum turn), tow her in;
    - shoot and haul the trawl with the TRAWL switch, and by hand with PAY OUT / HAUL on the A-frame;
    - anchor and weigh with the ANCHOR switch: the voltmeter dips while the windlass runs;
    - listen: the crane, winch and net drum's hydraulics, the anchor chain.
  - **Desktop:** the same by clicking.
  - **F3:** 46 modules with something drawn (the trawl and the windlass have nothing of their own to draw).

### Merged: the pilot house and the post-V1.0 changes into the modular boat (owner request after M5a)

- **Owner test (VR, /next/):** everything tested; all the modular work so far (M1 to M5a, with the merge) works. The owner's other feedback from that test goes to the dev branch through another session; it will be merged in here before the modular work moves to the dev branch.

- **What came in** from the dev branch (built by another session; see its entries above): the raked pilot-house front and raised side wall, the port side door, the fire gauge on the console, fewer and quieter calls, longer weather, the crew-mate figures, the help panel hidden at start.
- **Fitted to the modules** where the two met:
  - **The side door's push buttons are door-button modules**, like the aft door's: two new hull sockets on its forward jamb (`sideDoorIn`, `sideDoorOut`), mounted in the recipe (version 7) with the button bound to a new bus key, **`door.side.open`** (old name `sideDoor` kept, so older clients still work). The hull lists the side door as a feature. The door-button module has a config now: its hover text (`label`); its door starts open or shut as its key does (the aft door open, the side door shut).
  - The side door's sliding panel stays with the Bridge, as the aft door's does.
  - **The fire gauge** stays with the Bridge, next to the fire monitor, and goes with it when the monitor becomes a module (5b). Its config is `vessels.workboat.fireMonitor.gauge`. The monitor joystick and FIRE PUMP switch keep their console slots (modules since M3a), so the old `fireMonitor.joystick` / `pumpSwitch` positions stay removed.
- **Exactly as before:** all twelve golden runs match their recordings except for one new recorded value, `door.side.open` (always shut in them); they were re-recorded to add it. The sea-trials report is identical.
- **Checked:** typecheck, 414 tests, the build; in the browser, the helm, the console, the side door from inside (shut and open) and out, and the pilot-house front, against the dev branch's own build: the same. The side door opens by its new key and shuts by its old name; its buttons are found by the pointer. No page errors.
- **Draw calls** (day, M5a → merged; the live game's own build in brackets): helm 55 → 55 (67), chart table 44 → 51 (53), aft deck facing forward 95 → 105 (130), aft deck facing aft 28 → 28 (33). The rise is the new pilot house (the side door, its jamb, the raked glass and brow), which the live game pays for too.
- **Owner test** (at /SWVR/next/): the side door's buttons inside and out, and that it's quiet inside only with both doors shut; the fire gauge during a fire; then the M5a deck-gear steps above.

### M5b: the roof gear and deck fittings as modules (done, on /next/ for the owner to test; nothing should look or work differently)

- **What changed:** the rest of the deck gear is now modules in the recipe (`starterWorkboat.json`, version 8): the searchlight, the fire monitor, the mast, the four mooring cleats, the fenders, the swim ladder, the life ring station and the boat-hook rack. As with 5a, the world's systems ask the boat for her gear instead of reading the vessel config, and taking a module out takes its job with it. What you can't walk through on deck and roof now comes from the modules too. With this, M5 is done.
- **New modules** (`src/modules/`):
  - `deck.searchlight`: the roof lamp, its aim and its light. It declares its own 12 A draw on the deck lights' circuit (it was a generic 12 V consumer in M4a). The app tells it how dark it is and gives its light to the ocean.
  - `deck.fire-monitor`: the monitor on the roof and its fire gauge on the console (FIRE / ON TARGET), like the crane's console button. It needs the engine's power take-off (the pump) and 12 V. The fire system shoots the jet from its gear.
  - `mount.mast`: the signal mast's pole and yard (they were part of the hull mesh), the wind sock at its head, and a **socket of its own** at the masthead (`masthead`), where the navigation lights' 12 V consumer now hangs: the first module mounted on another module's socket outside the console.
  - `deck.cleat`, four of them (forward and aft, each side; config `end`, `side`). Each gives a bow or stern cleat: where the mooring lines act on her. She moors only with both; without them neither Dock nor a cleat makes a line fast.
  - `deck.fenders`: the basket and the six fenders. The fenders duty asks for them only if she has them.
  - `deck.swim-ladder`: the ladder over the starboard side, and where you climb it.
  - `rescue.life-ring-station` and `rescue.boat-hook-rack`: where the ring hangs and its line is made fast, and where the hook's clips are. They draw nothing of their own: the ring and hook are drawn by the rescue gear view, as they fly, float and are held. Without them there's no ring to take, no hook.
- **Footprints:** a module can now declare where it stands solid (`footprints(config, hull)`): boxes and discs in the boat's axes, with a height band so gear on the roof doesn't block the deck below. The walk area and cargo placement read them (`footprintsOf`). The crane and cradle, the winch, the A-frame's feet and the mast declare theirs, the same shapes as before: a test checks over 40,000 points of the deck that you're kept out exactly where v1.0 kept you out.
- **Gear facts added:** `searchlight`, `fireMonitor`, `bowCleat`, `sternCleat`, `fenders`, `swimLadder`, `lifeRing`, `boatHook`.
- **Config:**
  - `CONFIG.modules.searchlight.amps` (12 A; was in the recipe).
  - `CONFIG.modules.mast`: the mast's position, size, yard and how much roof round its foot you can't walk on (was hard-coded in the hull mesh and the walk area).
  - The rest stay where they were, as the modules' defaults until M6: `vessels.workboat.spotlight`, `.fireMonitor` (with `.gauge`), `.mooring`, `.fenders`, `.swimLadder`, `.rescueGear`.
- **Hull sockets:** 11 new: `fireMonitor` and `mast` on the roof; `cleatFwdPort`, `cleatFwdStbd`, `cleatAftPort`, `cleatAftStbd` on the bulwark tops; `fenders`, `swimLadder`, `lifeRing`, `boatHook`. The hull's `navLights` socket moved onto the mast.
- **Exactly as before:**
  - All twelve golden runs match (docking, the fire, the crane, the tow and the trawl among them), without re-recording.
  - The sea-trials report is identical.
  - **Draw calls unchanged** at all eight viewpoints: helm 55 / 57, chart table 51 / 52, aft deck facing forward 105 / 106, facing aft 28 / 27 (day / night). The mast's pole and yard moved from the hull's mesh to the boat's shared one, the ladder stays merged, the rest are drawn as before.
- **Tests (13 new, 427 in all, all pass):**
  - the footprints keep you out exactly where v1.0 did, on deck and round the mast on the roof; the walk area follows the recipe (no mast: you can walk where it stood);
  - each gear fact equals v1.0's figures; the navigation lights hang on the mast's masthead socket;
  - take a module out and its job goes: no cleats, she can't moor (Dock or cleat); no ladder, none to climb; no life ring or hook, none to take; no searchlight, no lamp and no draw; no fire monitor, no water; no fenders, no fenders duty.
- **Checked in the browser,** against the build before 5b:
  - screenshots of the roof from aft and from the bow, the console, the forward cleat, the aft quarter, the aft wall with the life ring, the port bulwark with the boat hook, and the searchlight at night: the same;
  - in play: from moored at Calder Haven, the bow and stern cleats each let their line go and she's free; fenders out; the ring and the hook taken; the searchlight lit at night and its pan clamped at 170°; the monitor's yoke turns with its joystick; the mast's foot can't be walked on, the floor below it can; the wind sock is on the mast. No errors apart from the dev server's favicon.
- **Owner test** (at /SWVR/next/, menu header NEXT). Everything should look and work as before:
  - **VR:**
    - the searchlight at night: switch it on, aim it with its joystick;
    - the fire monitor on a shore fire: the gauge on the console, ON TARGET, the fire going down;
    - dock at a berth with the cleats, bow and stern; cast off;
    - fenders out from the basket, and in;
    - throw the life ring and pull someone in; hook a crate with the boat hook;
    - go for a swim and climb back up the swim ladder;
    - walk round the mast on the roof; the wind sock streams in the wind.
  - **Desktop:** the same by clicking.
  - **F3:** 57 modules with something drawn.

### Merged: the post-5b changes from the dev branch into the modular boat (owner request)

- **What came in** (built by another session; see its entries above): lobster and crab potting (milestones 1-2, behind Settings > Game > Potting), charted hazards and IALA buoys, night panel lighting (red by itself at night), the start-up card on the console's upright face, dash labels tilted 45 degrees, the deck gate, the skiff's painter and the midship cleats, the anchor's 5:1 scope, the extinguisher and torch on their brackets, binoculars on the right mouse button, no glass in the doors, wooden fish boxes, woollen mitts, no fake radio voice on the Quest.
- **Fitted to the modules** where the two met:
  - **The deck gate's buttons are door-button modules** on two new hull sockets on its aft post (`sideGateIn`, `sideGateOut`), bound to a new bus key **`gate.side.open`** (old name `sideGate` kept). The hull lists the gate as a feature; its swinging panel stays with the Bridge, like the doors'.
  - **The midship cleats are two more cleat modules** (`end: 'midship'`, sockets `cleatMidPort`, `cleatMidStbd`): they take only the skiff's painter and give no mooring gear. The painter itself (vessel/physics/painter.ts) still reads the cleat stations from the vessel config until M6.
  - **Panel lighting on the modules:** the console's screens (the shared display atlas), the warning lamps' names, the start-up card, the breaker panel's dial and engraving, the battery master and selector plates, the FM display, the VHF and chartplotter screens, the fire gauge and every engraved label (except the overhead's, read from below) dim with the dark and go red at night.
  - **The start-up card's console slot** moved to the console's upright aft face (`helmConsole.slots.card`), where the dev branch put it.
  - **The fire monitor holds its aim only while the pump runs** (the module reads 'firePump.on'); the searchlight only while lit.
- **Recipe version 9.** Golden runs: all match except for the one new recorded value (`gate.side.open`, always shut) and the anchor run, which changes with the new scope rule; its 3,312 values shared with the dev branch's own re-recording are identical. Sea trials identical.
- **Checked:** typecheck, 450 tests (the dev branch's new ones among them: the gate, the painter, the extinguisher, potting, the nav marks), the build; in the browser, the helm by day and night, the console and the card, the gate shut and open, the midship cleat and the gear brackets against the dev branch's own build: the same. The gate opens by its new key and shuts by its old name; its buttons and all six cleats and the skiff's bow cleat are found by the pointer. No page errors.
- **Draw calls** (day / night, the dev branch's own build in brackets): helm 62 / 64 (74 / 77), chart table 57 / 58 (59 / 60), aft deck facing forward 115 / 116 (140 / 141), facing aft 36 / 35 (41 / 40). Up on 5b's with the new features (the buoys, the hand gear, the gate), as on the dev branch; still cheaper there at every viewpoint.

### M6a: the hulls hold their shape and mass; every boat from her recipe (done, on /next/ for the owner to test; nothing should look or handle differently)

- **M6 in three stops** (the plan gave it as one; each stop leaves the game playable and the same):
  - **6a (this):** the hulls hold their own shape, mass and handling; every boat, the skiff and the three tows too, is built from her recipe.
  - **6b:** no more "the workboat": `WorkboatDef` / `isWorkboat` and the hand-built Bridge go; the world systems find the player's boat (`world.homeVesselId`); the app's one-boat singletons become per boat; the remaining equipment positions move out of the vessel configs.
  - **6c:** the bus moves to its flat record in VesselState; the new save shape with a migration (with `next` on its own save keys first, so a test can't spoil your career); recipes in multiplayer's welcome.
- **What changed:**
  - **The hull definition holds the hull** (`modular/hull.ts`): her form (today's hard-chine generator and its parameters), her lightship, added mass, damping, resistance, windage, deck and wheelhouse layout, cargo deck, helm position and spawn. The numbers stay in `CONFIG.vessels` (the tunables' home); the hull files take them from there (`boats/hullData.ts`).
  - **Five hulls, five recipes:** `hull.workboat-12m` (as before), `hull.skiff-3.6`, and the tows' `hull.derelict-cruiser`, `hull.log-raft`, `hull.work-barge`. The tows' recipes mount nothing: a tow is a hull with no modules.
  - **VESSEL_DEFS is built from the recipes** (`modular/vesselAssembly.ts`): the hull's form and handling, plus her modules. Until 6b the positions of equipment only some boats carry (the bridge layout, lights...) still came from the vessel config the hull named.
  - **Lightship and module masses** (`modular/massProperties.ts`, section 2.6 of the plan): the diesel declares its mass (1,300 kg with its gearbox, `CONFIG.modules.dieselInboard.massKg`), and so do the two house batteries (28 kg each, `CONFIG.modules.batteryBank.massKg`). The hull's lightship is the weighed boat (18.3 t, CG and radii of gyration as before) less those two, and the boat's mass, CG and inertia are summed back from her lightship and her modules (parallel-axis rule, as for deck cargo). So she weighs, trims and rolls exactly as before, and a recipe with a heavier battery bank makes an honestly heavier boat, her CG drawn toward it.
  - **The skiff's outboard is a module,** `propulsion.electric-outboard` on a new `transom.mount` socket: the motor, its battery and its thrust through the physics port, inside the hull's step where it always was. Its arithmetic is unchanged (`vessel/physics/outboard.ts`). Her tiller is still the app's until 6b.
  - Every boat now runs her modules' upkeep the same way (the old "no recipe" path in the simulation is gone; for the skiff and tows it did the same things).
  - The boats' library is loaded first, by the game's entry (`src/main.ts`) and the tests' setup (`tests/setup.ts`): the modules import the vessel registry, so the registry can't import them; the library hands it how to build the boats.
- **Config:** `CONFIG.modules.dieselInboard.massKg` (1300), `CONFIG.modules.batteryBank.massKg` (28 each). My estimates for a 400 kW six-cylinder with its gearbox and a 12 V 100 Ah battery; change them freely, the starter boat's total stays as weighed.
- **Exactly as before:**
  - Every vessel definition built from its recipe equals the one its config gave, field for field; the workboat's mass, CG and inertia to one part in a billion (they're now summed).
  - All twelve golden runs match without re-recording (the skiff's among them); the sea-trials report is identical.
  - Draw calls unchanged (62 / 57 / 115 / 36 by day).
- **Tests (8 new, 458 in all, all pass):** a valid recipe on a known hull for every vessel type; each definition equals the old one; the tows mount nothing and the skiff her outboard; a heavier battery bank makes a heavier boat, her CG drawn toward it; the skiff drives and draws her battery with her outboard module and not at all without it; a lightship plus its parts is the weighed boat again; the workboat's hull is lighter by her engine and batteries and they put her back as weighed; a heavier part makes a heavier boat.
- **Checked in the browser:** the workboat starts and makes way (her assembled mass 18,300 kg); the skiff, set afloat, drives on her outboard module and draws her battery; a tow appears; no errors apart from the dev server's favicon.
- **Owner test** (at /SWVR/next/): she should handle exactly as before:
  - **VR:** drive the workboat out and back, a crash stop and a hard turn; launch the skiff and drive her on the tiller; take a tow.
  - **Desktop:** the same with the keys.

### M6b: no more "the workboat": the home boat, and each setting where it belongs (done, on /next/ for the owner to test; nothing should look or handle differently)

- **M6 is now four stops, not three.** What was left of 6b turned out to be two jobs of quite different kinds, so it's split to keep each stop small enough to test properly:
  - **6b (this):** the simulation side. The world knows which boat is yours; nothing asks "is this the workboat?" any more; every machinery setting is read from the module that owns it.
  - **6c (next):** the drawing side. The hand-built Bridge (the doors and gate, the engine under the hatch, the rain on the glass, the lights) becomes a view put together from each boat's recipe; the app's one-boat pieces become per boat; the skiff's tiller becomes a module.
  - **6d:** the bus's flat record in the boat's state, the new save shape with a migration (with `next` on its own save keys first, so a test there can't spoil your career), and recipes in multiplayer's welcome. (This was "6c" before.)
- **What changed:**
  - **The home boat** (`world.homeVesselId`, `homeVessel(world)` in `core/world.ts`): the rescues, tows, fires, salvage, cargo duties, potting, forecasts, the tutorial, the career and multiplayer find your boat by it, instead of "the first workboat". A world saved or sent before this still works (it falls back to the first workboat).
  - **`WorkboatDef`, `isWorkboat` and `asWorkboat` are gone.** They meant "a boat with everything": engine, bridge, lights, anchor, mooring and rescue gear all at once. Each place that used them now asks for just what it needs.
  - **Machinery settings come from the module that owns them** (`gearOf(boat, kind)`), no longer from the vessel definition. New gear kinds: `diesel` (engine, propeller, and its upkeep: oil, checks, where the block and dipstick are), `rudder`, `outboard`, `batteries`, `bilgePump` (with the BILGE lamp's level), `chartTable` (its plan on the floor, for the walk area, worked out from its socket) and `midCleat`. The engine sound, the dash screens, the warning lamps, the duties, refuelling, the walk area, the skiff's painter and the sea trials all read these. A boat without a diesel simply has no engine duties, lamps or smoke, rather than breaking.
  - **What's built into a hull is the hull's** (`fittings` on the hull definition): her lights' positions, the exhaust outlet, the places a rescued casualty is put, and (until 6c) the wheelhouse fit-out the Bridge places its controls by; a tow's look and radio name. The old link to the vessel config (`legacyDef`) is gone: a boat is her hull plus her modules.
  - **A hull with a wheelhouse** is now the one remaining "kind of boat" in the code (`WheelhouseDef`): a fact of her shape. The Bridge, the wheelhouse interior and the app's wheelhouse views need one until 6c.
  - **The lights, smoke, anchor chain and mooring lines are drawn where the boat has them,** each on its own, instead of all-or-nothing for "the workboat".
  - Dead code removed: the old (vessel, workboat) wrappers for the engine, steering, ignition, fuel, anchor and bilge, which nothing called since the engine became a module.
- **Config:** no new tunables. The diesel module's defaults now include the workboat's `maintenance` block, and the bilge pump's its `bilge.alarmAt` (the same figures). The quick-start and battery-drain switches are session settings and stay where they were, `CONFIG.vessels.workboat.electrics.quickStart` / `drainBetweenSessions`.
- **Exactly as before:**
  - All twelve golden runs match without re-recording; the sea-trials report is identical.
  - Draw calls unchanged: 62 / 57 / 115 / 36 by day, 65 / 58 / 116 / 35 at night.
- **Tests (1 new, 459 in all, all pass):** her machinery and fittings are where her vessel config had them (each gear kind equals the old figures; the skiff and tows have no diesel, rudder, batteries, bilge pump or chart table; the hull's fittings are the workboat's). One test changed its expectation: a skiff with her outboard taken off now has no outboard battery at all (her state follows her modules).
- **Checked in the browser:** the workboat quick-starts and makes way; the skiff drives on her outboard and draws her battery; a tow appears; the home boat is set; at night the deck floods, rail and cabin lights, nav lights and the engine, RPM and rudder screens all draw. No errors apart from the dev server's favicon.
- **Owner test** (at /SWVR/next/): she should look and handle exactly as before:
  - **VR:** start her properly (master, breakers, key, HEAT, START) and check the warning lamps and the engine screens; drive out, a hard turn, a crash stop; dock with the mooring lines; let the anchor go and weigh it; launch the skiff, drive her, make her painter fast to a midship cleat; at night, the nav lights, floods and cabin light; take a tow; open the chart table's leaf and walk round it.
  - **Desktop:** the same with the keys, plus the E key (quick start, if it's on) and Menu > Tests > Quick start; refuel at a fuel berth.

### M6c: every boat drawn and worked from her recipe; the skiff's tiller a module (done, on /next/ for the owner to test; nothing should look or handle differently)

- **What changed:**
  - **The hand-built Bridge is gone.** Each boat with modules now has a *boat view* (`app/boatView.ts`), put together from her recipe: her modules, the parts of her hull that move (the wheelhouse doors and the deck gate, where she has them) and the rain on the front windows (with a wheelhouse). Her modules' fixed parts are still baked into one mesh, their labels into another, their screens onto one display atlas: the same draw calls as before. The workboat and the skiff each have one; a tow (a hull with no modules) needs none.
  - **The lights are modules that draw themselves**, replacing the plain "consumer" entries in the recipe:
    - `light.navigation` on the mast's masthead socket (the masthead light, sidelights and stern light, worked as one set);
    - `light.cabin` (the ceiling lamp, white or red);
    - `light.flood`, twice (`end: fore` and `end: aft`);
    - `light.rail` (the LED strips along the bulwark tops).
    
    Each draws the same current on the same breaker as before and lights only with 12 V on its circuit. A module's view now gets the scene each frame (how dark it is, where you are), which the nav lights need for their arcs of visibility.
  - **The engine under the hatch is the diesel module's own view** (`vessel/view/engineLook.ts`), drawn where the hull has an engine space under the wheelhouse floor.
  - **The skiff's tiller is a module** (`control.tiller`) on her outboard's own `tiller` socket: the handle, the motor it swings, the gear lever, the on/off button and the battery bars. Its helm and throttle are the bus keys the outboard reads.
  - **Each control knows which boat it works** (`route`): the skiff's tiller and painter cleat send to the skiff, the workboat's controls to the home boat. The app keeps one boat view per vessel instead of "the bridge" plus a list of tillers.
  - **Recipes:** the workboat's is version 10 (the four light modules), the skiff's version 2 (the tiller).
- **Config:** no new tunables. The light modules take their defaults from the figures they always used: `CONFIG.vessels.workboat.navLights`, `.cabinLight` and `.deckLights`; the tiller from `CONFIG.vessels.skiff.outboard`. These no longer ride on the hull: the hull's fittings are now just the exhaust outlet and the rescue places (and a tow's look).
- **Exactly as before:**
  - All twelve golden runs match without re-recording; the sea-trials report is identical.
  - Draw calls unchanged: 62 / 57 / 115 / 36 by day, 65 / 58 / 116 / 35 at night.
  - Screenshots from the eight viewpoints look the same as 6b's; the only pixel differences are the sea's motion and a radio notice.
- **Tests (7 new, 466 in all, all pass):**
  - The floods light only when switched on with 12 V.
  - The cabin lamp goes red, and the nav lights glow only when on.
  - The engine's parts go in the boat's one fixed mesh.
  - The workboat's doors, gate and rain glass are built, and her controls go to the home boat.
  - The skiff's tiller is a module on her outboard, at the motor's pivot, with no doors and no glass.
  - The skiff's motor button sends to the skiff.
  - Under her tarpaulin the skiff is neither drawn nor usable.
- **Checked in the browser:**
  - The workboat starts and makes way.
  - The skiff, set afloat in open water, drives at 5.4 kn on her outboard.
  - Working the skiff's motor button and tiller changes the skiff and not the workboat.
  - In her cradle the skiff is covered.
  - At night the floods, rail lights, cabin light and nav lights show.
  - No errors apart from the dev server's favicon.
- **Owner test** (at /SWVR/next/): she should look and work exactly as before:
  - **VR:**
    1. At night, switch each light: nav lights (walk round her: red to port, green to starboard), cabin (white, then red), both floods and the rail lights from the overhead panel; then pull the DECK LTS breaker.
    2. Open the engine hatch and look at the engine.
    3. Open and shut both doors and the gate; watch the wipers in the rain.
    4. Launch the skiff: grab the tiller, steer, throttle on the trigger; work the gear lever and the motor button; make her painter fast.
    5. Recover her: covered in the cradle, her tiller can't be touched.
  - **Desktop:** the same; on the skiff, click the tiller and drive with W / S / A / D.

### Fix: lifting a hooked crate aboard in VR; no strobes on crates (owner test)

- **The bug:** in VR you could hook a floating crate and bring it alongside, but not lift it aboard. The lift needed your free hand within 1 m (horizontally) of the crate. But the crate rides at the end of the 2.2 m pole, well out from the rail, so no arm could get there. The test for it passed only because it put the hand 2 m outboard of the rail.
- **Now** (`rescue/rescueHands.ts`), with the crate alongside, either works:
  - grip the hook's **pole** with your other hand, anywhere along it (hand over hand, to haul it up);
  - or reach over the side towards the crate and grip: within `CONFIG.rescue.liftHandReach` (2.2 m, about the pole's length) of it horizontally, and above it. A hand across the deck doesn't count.
  
  The hint when it comes alongside says so. Desktop unchanged: click it once it's alongside.
- **No strobes on crates** (owner request: they made lost cargo too easy to find). Survivors' lifejackets keep theirs. At night you find crates with the searchlight.
- **Config:** `CONFIG.rescue.liftHandReach` (new, 2.2 m). `rescue.strobePeriod` / `strobeOn` / `strobeDarkness` now apply to survivors only.
- **Tests (2 new, 468 in all, all pass):**
  - The VR lift test now uses a hand beside the hook hand at the rail. It fails with the old 1 m rule and passes now.
  - A hand on the pole lifts the crate.
  - Neither a hand across the deck nor a crate still out of range lifts it.
- **Owner test:**
  - **VR:** take a lost-cargo call, hook a crate and bring it alongside. Grip the pole with your other hand: the crate comes into that hand. Next time try reaching over the side towards it instead. At night, check the crates no longer flash; survivors still do.
  - **Desktop:** unchanged (click the crate on the hook once it's alongside).

### M7a: the landing craft, the second boat built from modules (done, on /next/ for the owner to test)

- **Why now:** the owner wants to reach the test of the architecture: build a new boat from modules and see whether they fit and the process is efficient. 6d (saves, the flat bus record, recipes in multiplayer) isn't needed for that and comes after. M7 is in two stops: **7a** (this: the boat), **7b** (the bow ramp module, beaching, walking off).
- **What she is:** the hull study's `landingCraft` design, a 9 m aluminium work boat with a square landing bow, a cabin aft of amidships and an open foredeck (her cargo deck), with one small inboard diesel. Start the game in her from **Debug > Boat > Start in > Landing craft**; the game restarts in her, alongside in Calder Haven.
- **What it took** (the plan's test: "a hull, a JSON file and one module"):
  - **Her lines:** the study's design as it was (`src/hulls/designs.ts`), lofted into the game's stations (`vessel/hullForm.ts hullFormFromDesign`). The same stations float her and draw her. The game's stations are upright with one chine a side, so the study's raked bow is set upright at its deck edge. Her deck runs 10.2 m, the deck plan and walk area are the design's, and the rake goes into the run of the bottom up to the bow, which is out of the water.
  - **Her hull** (`src/boats/landingCraftHull.ts`, numbers in `CONFIG.vessels.landingCraft`):
    - **Mass:** 7,850 kg, what her stations displace at the design waterline, so she floats on it; CG over her LCB.
    - **Handling:** the workboat's per-area damping and resistance curve, with the angular damping scaled to her size.
    - **Layout:** the cabin, its walkable roof and ladder, the engine hatch.
    - **Her 25 sockets.**
  - **Her recipe** (`src/boats/landingCraft.json`): 35 modules, every one the workboat's. A 150 kW diesel (the workboat's engine module with a scaled torque curve, a 0.55 m propeller and a 1.42:1 gearbox), a 0.3 m² rudder, a 300 L tank, batteries, bilge pump. A compact console with 17 controls and screens; breakers, master, selector, VHF, cabin door buttons, engine hatch, dipstick and oil can; cabin lamp, searchlight, navigation lights, four cleats. Her machinery's settings live in this file, as any boat's modules' do.
  - **Does it fit?** The workboat's console is 2.6 m across; her cabin is 2.0 m inside. The fit check now knows the console's size, so her helm socket **refuses** the standard console ("doesn't fit the space"). Her recipe gives the same console module a compact layout, 1.8 m across, which fits. That's the shipyard's check (M8) working for real.
- **The ledger: shared code she showed up**, all fixed in the shared code, not worked round:
  - Expected (the plan's own steps): the lofted hull form; hulls carrying either kind of form; the Debug-menu start.
  - **Leaks** (things that assumed the workboat):
    - the hull mesh closed only a transom, so a square bow is now plated across with its bulwark;
    - a wheelhouse's side door, raised sills and raked front were typed as always present;
    - the console never declared its size, so the fit check couldn't refuse it;
    - every game made a skiff, even for a boat without a crane to carry it;
    - the extinguisher, torch and binoculars were hung at the workboat's places. They're now the hull's `stowage` fittings; gear a hull has no place for isn't aboard.
    - fire calls and timber-salvage calls came whatever the boat carried. They now need a fire monitor or a tow point, as towing and fishing have since M5.
  - **Verdict:** her data is one hull file (85 lines), one config block (about 130 lines, mostly comments) and one recipe. The shared code needed six small fixes, each now true for any boat.
- **Her numbers, from her sea trials:**
  - Afloat: 7.85 t, draught 0.48 m, floats level, GMt 1.12 m, max GZ 0.37 m at 40°.
  - Speed: 10.2 kn flat out at 1680 rpm, 36.8 L/h (83 nm on 300 L); 5.6 kn at quarter lever.
  - Manoeuvring: tactical diameter 25 m (2.4 L); crash stop 15 m in 5.7 s.
  - Motions: roll period 2.4 s, 28 % damped.
- **For now:**
  - one bulwark height, 0.5 m (the design's runs 0.32 m aft to 0.62 m forward);
  - the workboat's paint (livery is the shipyard's, M8);
  - no anchor, no life ring or boat hook, no rescue places, so no rescue, tow or fire calls come for her; cargo runs do;
  - multiplayer with her isn't supported yet: a crew-mate would still see the workboat until recipes go in the welcome (6d).
- **Config:** `CONFIG.vessels.landingCraft` (new: mass, `engineKg`, CG, radii of gyration, added mass, damping, resistance, windage, layout, cargo deck, boarding spot, spawn, exhaust, hand gear `stowage`, module `places`).
- **Exactly as before for the workboat:**
  - All twelve golden runs match without re-recording; her sea trials are unchanged (the report gains the landing craft's).
  - Draw calls unchanged: 62 / 57 / 115 / 36 by day, 64 / 58 / 116 / 35 at night.
  - The landing craft at her helm: 52 by day.
- **Tests (9 new, 480 in all, all pass):**
  - her stations run transom to bow, with a square bow, and she has a cabin;
  - the cabin floor is above the deck;
  - assembled she weighs what she displaces;
  - her recipe is valid and uses only existing modules;
  - the workboat's console is refused and her compact one fits;
  - her machinery is right, with no crane, tow point or fire monitor;
  - you can stand at her helm, on her foredeck and in her cockpit, but not through the cabin walls;
  - a game started in her has no skiff and no fire or timber calls;
  - she starts and makes over 9 kn.
  
  The crane test now expects a workboat without her crane to carry no skiff.
- **Checked in the browser:** started in her at Calder Haven, boarded at the helm, quick-started, cast off and got under way. Her four dash screens are live, her mooring lines are made fast to her own cleats, and there are no errors. Screenshots from the quarter, bow, side and top look right: cabin aft, open foredeck, square bow with its bulwark.
- **Owner test** (at /SWVR/next/):
  - **VR:** Settings > Game > Debug tab shown, then Debug > Boat > Start in > Landing craft (the page reloads; enter VR again). Then:
    1. Walk aboard and look her over: cabin, roof (by the ladder on the cabin's aft face), foredeck, cockpit, the square bow.
    2. Start her properly: master and breakers on the cabin's aft and starboard walls, key, HEAT, START.
    3. Drive her: turns, a crash stop. Open the engine hatch and check the oil.
    4. Moor her alongside.
    5. Back to the workboat: Start in > Workboat.
  - **Desktop:** the same.
  - **Your eye on her:** her lines, the 0.5 m bulwark, the console layout, where things sit. All her numbers are in `CONFIG.vessels.landingCraft` and her recipe.

### M7a+: the landing craft in aluminium grey, and her bow ramp (owner request; done, on /next/ for the owner to test)

- **The owner asked:** paint her the aluminium grey of the reference pictures, and give her an animated bow ramp worked by a button. The ramp isn't a module: no other boat would carry it, so it's part of her hull. The button can be a module.
- **Her paint:**
  - A hull can now carry its own **livery** (a hull fitting, `livery`), which the hull mesh draws her in. A part it doesn't name keeps the workboat's colour.
  - Hers is the hull study's paint for her design (`src/hulls/designs.ts`): grey topsides (0xb9bec2), dark grey bottom, a darker grey deck and a light grey cabin and roof. Her rails take the study's inner-bulwark grey.
  - The workboat has no livery and keeps her orange and white.
- **Her bow ramp** (`src/controls/BowRamp.ts`; numbers in `CONFIG.vessels.landingCraft.layout.bowRamp`):
  - **Size and swing:** a 1.9 x 1.2 m aluminium plate, hinged across the top of her bow plate. Raised, it leans forward at 60° and closes the bow in place of the bow bulwark. Lowered, it hangs 35° below the horizontal, ready to put its lip on a beach.
  - **Movement:** it takes 6 s either way, easing in and out as a hydraulic valve opens and closes.
  - **What it looks like:** turned-up side edges, grip bars across the walking face, a bevelled lip, and hinge knuckles.
  - **Rams:** two hydraulic rams work it. Their cylinders pivot on posts on the foredeck (drawn with the hull) and their rods on lugs on the ramp's edges. Each frame they turn to stay joined, so the rods slide in and out as it swings.
  - **Draw calls:** three (the ramp, the two cylinders, the two rods).
  - **Why only 1.2 m long:** her bow deck is 1.3 m above the water, so a longer ramp would reach a beach better. But raised, a longer one would stand above the helmsman's eye and hide the water ahead. At 1.2 m its top is about 1 m above the deck, roughly the rail's height, and you can see over it from the helm. Tune `length` and `raisedDeg` if you'd like a different trade.
  - **Bus key and state:** `ramp.bow.down` (`controls.bowRamp`, 1 = lowered; it starts raised). It's a hull feature (`ramp.bow`), as the cabin door is.
- **The buttons:** two of the existing door-button modules, bound in her recipe to `ramp.bow.down`, labelled "Bow ramp: lower / raise":
  - one on the cabin's port wall by the helm;
  - one on the inboard face of the port bulwark by the bow (new sockets `rampCabin` and `rampBow`).
  
  Their caps glow green while the ramp is down. No new module was needed.
- **For now (7b):**
  - the ramp is only drawn: she floats, steers and walks the same with it up or down;
  - there's no throttle limit with it down (the plan's interlock);
  - you can't walk out onto it yet; beaching and walking off come in 7b.
- **Config:** `CONFIG.vessels.landingCraft.layout.bowRamp` (`width`, `length`, `raisedDeg`, `loweredDeg`, `travelSec`, `ram {x, aft, height, along}`, `button {z, y}`), `places.rampButton`.
- **Exactly as before for the workboat:**
  - Golden runs: the only difference is the new key, always "raised", now in each snapshot; they were re-recorded for that alone.
  - Draw calls unchanged: 62 / 57 / 115 / 36 by day, 65 / 58 / 116 / 35 at night.
  - The landing craft's helm view: 56 by day (was 52).
- **Tests (3 new, 483 in all, all pass):**
  - she's painted grey and the workboat isn't;
  - two buttons on the ramp's key; it starts raised and goes down and up;
  - the rams reach from raised to lowered without coming apart, and the ramp swings all the way.
- **Checked in the browser:**
  - started in her;
  - pressed the bow button through the game's own control path: the ramp went down;
  - pressed the cabin button: it came back up;
  - screenshots raised, halfway and lowered, from the quarter, the side, the foredeck, the helm and the cabin. Both buttons' caps face out.
- **Owner test** (at /SWVR/next/, Debug > Boat > Start in > Landing craft):
  - **VR:**
    1. Look at her from the pontoon: grey all over.
    2. Walk forward on the foredeck. Press the green button on the port bulwark by the bow: the ramp lowers over 6 s, with the rams sliding out. Press it again: it rises.
    3. In the cabin, press the button on the port wall by the helm, and watch the ramp through the windscreen.
    4. At the helm, raised: check you can see the water ahead over it.
  - **Desktop:** the same, clicking the buttons.
  - **Your eye on it:** its length, angles and speed, and the rams' look. The numbers are all in `bowRamp`.

### Landing craft: breaker panel, a step down into the cabin, 20 knots (owner test of M7a+; done, on /next/ for the owner to test)

- **The owner's test:** generally good, but:
  - the breaker panel was half hidden in the cabin wall;
  - the cabin felt too low (try a step down into it);
  - make her faster: really she should plane. That's a big job, so for now a 20 kn top speed.
- **Breaker panel:** it was placed 0.01 m inside the starboard wall, so its 0.12 m-deep box was buried in it. It now sits with its back flat against the wall (`places.breakerPanel` x 0.865).
- **A step down into the cabin:**
  - **Floor:** her cabin floor is lowered 0.25 m, to 0.77 m. That's 0.19-0.23 m below the deck around the cabin, a single step you take at the door.
  - **Headroom:** 2.2 m to the roof (was 1.95). The roof stays where it was.
  - **Door and windows:** the door and the window heads are raised 0.2 m, so they don't sit low in the walls.
  - **What moved with the floor:** everything in the cabin is now placed from the floor (`LC_FLOOR` in config.ts): the console, the panels, the buttons, the hand gear, where you stand, and the engine and its space under the hatch.
  - **Drawing it** (shared code, for any hull whose cabin floor is below her deck; `hullMesh.ts sunkenHouse`): the deck is cut away inside the cabin, the walls reach below the floor, and the step at the door has a face. The workboat's floor is above her deck, so she's drawn exactly as before.
  - **Trade-off:** your eye at the helm is 0.25 m lower. You still see the water over the raised bow ramp, from about 70 m ahead (was about 55 m).
- **20 knots** (her recipe, `src/boats/landingCraft.json`):
  - **Engine:** 280 kW (375 hp) in place of 150 kW: the same torque curve scaled up, the same 1,800 rpm, so the rpm gauge still fits. 800 kg with its gearbox (was 600; her total weight is unchanged, so the hull's own share is lighter). Its cooling is scaled up to match.
  - **Propeller and gearbox:** a 0.6 m, higher-pitch propeller on a 1.35:1 gearbox. Wake and thrust deduction are cut to a fast boat's (0.06 and 0.08).
  - **Settling drag:** her slow-speed settling drag (`damping.surgeLinear`) is cut from 20 to 5. At 20 kn it was adding about 4 kN, a third as much again as her resistance curve.
  - **Engine bed:** her engine socket now takes up to 300 kW.
- **Her sea trials now:**
  - **Speed:** 20.0 kn at full lever (1,696 rpm, 60 L/h, about 100 nm on 300 L); 13.7 kn at three-quarters; 9.2 kn at half.
  - **Acceleration:** 0 to 90 % of top speed in 11 s.
  - **Turning:** tactical diameter 32 m (was 25 m); speed in the turn 9.2 kn.
  - **Crash stop:** 31 m (was 15 m), because she's going twice as fast.
  - **Bollard pull:** 2.1 t.
  - **Engine temperature:** holds 86 °C after ten minutes flat out.
- **What isn't modelled yet** (real planing is a bigger job):
  - She doesn't rise or trim at speed: she runs level at her displacement draught.
  - In a hard-over turn at 20 kn she heels outward, up to about 20° for a moment, then about 7° steady. A planing hull banks into the turn. A smaller rudder barely changed it, so it's the hull model, not the rudder.
  - Her resistance past the hump is a flat fraction of her weight, a reasonable stand-in for a planing hull's.
  
  Proper planing (dynamic lift, running trim, banking into turns) would be its own milestone.
- **Config:** `LC_FLOOR` (new, 0.77), `vessels.landingCraft.layout.wheelhouse.floorY / doorHeight / windowHead`, `places.*` (from the floor), `stowage`, `boardingSpot`, `engineKg` 800, `damping.surgeLinear` 5. In her recipe: the diesel's `powerKw`, `torqueCurve`, `gearRatio`, thermal and propeller.
- **Exactly as before for the workboat:**
  - Golden runs match without re-recording.
  - Draw calls unchanged: 62 / 57 / 115 / 36 by day, 64 / 58 / 116 / 35 at night.
  - The landing craft's helm view: 53 by day.
- **Tests (483, all pass):**
  - the "floor above the deck" test is now "a step down": less than a step, at least 2.1 m headroom, the engine space still inside the hull, and the deck cut away over her cabin but not the workboat's;
  - a walk from the cockpit, down the step and through the door to the helm, no pace higher than a step;
  - her diesel is 280 kW and she makes over 19 kn.
- **Checked in the browser:** the breaker panel flat against the wall and fully visible; the cabin from inside (helm view, aft wall, ceiling) and through the door from the cockpit; her from outside.
- **Owner test** (at /SWVR/next/, Debug > Boat > Start in > Landing craft):
  - **VR:**
    1. Walk from the cockpit into the cabin: you step down at the door.
    2. Stand inside and check the headroom, and that the breaker panel on the starboard wall is fully visible and its breakers work.
    3. Start her, cast off and open her up: about 20 kn flat out (watch the speed screen).
    4. Try a hard-over turn at speed, and tell me how the heel feels.
  - **Desktop:** the same.

### Landing craft: her own engine sound, a turbocharged V8 (owner request; done, on /next/ for the owner to test)

- **The owner asked:** keep the workboat's engine sound exactly as it is ("as close to perfect as I could imagine"), and give the landing craft's bigger engine (since the 20 kn change) its own, maybe with more cylinders.
- **Engine voices** (`CONFIG.engineVoices`): the sound model's settings are now a voice per kind of engine, and the diesel module names its engine's voice in the recipe (`voice`). The settings are:
  - the number of cylinders and each firing's strength in firing order (the rhythm);
  - the jitter and the pulse length;
  - the two exhaust resonances;
  - how the tone opens up and gets louder with revs and load;
  - the saturation, the intake rush, and a turbo.
  
  The sound engine was generalised to take them (`audio/dieselWorklet.ts`, `audio/engineAudio.ts`). It rebuilds itself if you're in a boat with a different engine.
- **The workboat: unchanged.** Her voice, `inlineSix`, is today's numbers, and her diesel names none, so she gets it by default. Rendered offline, before and after differ by 0.4 %, exactly what the old code differs from itself between two renders (the intake hiss is random noise).
- **The landing craft: `v8`, a turbocharged V8:**
  - **Eight cylinders** fire four times a revolution: 40 Hz at idle, 113 Hz flat out (the six: 30 / 85 Hz). So it's a busier, slightly higher beat flat out. That's what a V8 is.
  - **The burble:** in a V8's firing order (1-5-4-2-6-3-7-8) the two banks take turns unevenly (port, port, starboard, starboard, starboard, port, port, starboard). The port bank, nearer the exhaust, is louder, so a low lope runs under the beat. That's the V8 burble, and it keeps the sound deep: up to three-quarter lever about 90 % of it is below 100 Hz.
  - **A bigger exhaust:** its two resonances are lower (85 and 132 Hz, against 110 and 150), with a little more saturation under load.
  - **Turbo:** a faint whine that spools up with boost (1.4 to 3.2 kHz). It's the only sound above a few hundred Hz, kept about 35 dB down. `turbo.gain` 0 removes it.
  - **Level:** about 3 dB louder than the six at idle, about the same flat out.
  - **The wet exhaust** muffles it under water just like the workboat's, and the turbo whine with it.
- **Checked:**
  - rendered both engines offline in headless Chromium at idle, 1,100 rpm, 1,450 rpm, flat out, and flat out with the exhaust under. Levels and frequency bands are above; listening samples were sent to the owner;
  - in the game, the landing craft builds the V8 voice and the workboat the six, with no errors.
- **Not checked:** how it sounds on the Quest's speakers. That's the owner's test.
- **Config:** `CONFIG.engineVoices` (`inlineSix`, `v8`); her recipe's diesel `voice: "v8"`.
- **Tests (483, all pass):** her diesel's voice is the V8, and the workboat's is unset (the six).
- **Owner test:** at /SWVR/next/, start in the landing craft (Debug > Boat > Start in). In VR and on desktop:
  1. Listen at idle on deck and in the cabin.
  2. Rev her through the range.
  3. Flat out, listen from the cockpit by the exhaust.
  
  Then go back to the workboat and check she sounds as before.

### Touchscreen controls: a first step toward the phone version (owner request; done, on /next/ for the owner to test)

- **The owner asked:** to try the game on a phone now: get in the boat at the helm (or start there on a touchscreen), start the engine with one button, and two touch controls to steer and for the throttle. It's the first step toward a version the owner's children can play on their phones. No multiplayer from a phone at first (owner).
- **One app or two?** Built into this app, not a separate one. The touch controls are a thin layer that sends the same commands as the keyboard and the bridge controls, so the boats, physics and sounds are shared, as "one engine, three games" intends. A separate page (`/SWVR/mobile/`) with cut-down graphics can come later from the same code if phones need it.
- **What you get** (`src/ui/touchControls.ts`), plain on-screen controls over the 3D view:
  - **Throttle slider, left:** ahead at the top, astern at the bottom, and a neutral notch in the middle you can't miss. Touch where you want it.
  - **Helm slider, bottom right:** port to starboard. It stays where you leave it, as a wheel does; **MID** centres it.
  - **Buttons, top right:**
    - **Board / Go ashore** (boarding puts you at the helm);
    - **Start engine / Stop engine:** one press does master, breakers, key, heat and start, putting the lever to neutral first. On the skiff it switches her motor;
    - **Cast off / Moor here:** casting off lets her lines go; mooring needs a berth in range;
    - **Menu.**
  - **Readout, top left:** speed and rpm.
  - **Looking round:** drag a finger anywhere else on the screen.
  - **On a touchscreen you start aboard at the helm.**
- **When they show:** on a device with a touchscreen and no mouse. Add `?touch=1` to the address to force them on (to try on a desktop), or `?touch=0` to hide them. They hide in VR. On a phone, the "VR NOT SUPPORTED" badge is hidden too, as it sat under the helm slider.
- **Shared code tidied:** the arrow-key driving and the touch sliders now share one routine (`App.driveTo`): throttle and helm sent as commands, including the skiff's outboard (gear times twist grip). The keys drive exactly as before.
- **Config:** `CONFIG.touch` (`leverDetent` 0.08, `lookSensitivity`, `startAboard`).
- **Checked:**
  - in headless Chromium as a phone, landscape (844 x 390) and upright (390 x 844), with real touch events. It started aboard at the helm. Cast off, started her, throttle to 80 %, helm to starboard, a look-round drag, MID: she got under way and made 10 kn;
  - as an ordinary desktop: no touch controls, and the arrow keys still drive;
  - typecheck and all 483 tests pass; the workboat's golden runs are unchanged.
- **Not checked:** a real phone (speed, the feel of the sliders, the sound). That's the owner's test.
- **Known limits:**
  - landscape is much better than upright (the view is narrow upright);
  - no walking on a phone yet (you stay where you stand);
  - you can't tap the 3D controls on the dash reliably;
  - the menu is the 3D menu, opened in front of you;
  - the graphics aren't cut down for phones, so an older phone may be slow.
- **Owner test:**
  - **Phone:** open https://tartanski-cpu.github.io/SWVR/next/ held sideways. Tap once for sound. You should be at the helm. Then:
    1. Cast off, then Start engine.
    2. Push the throttle up and steer with the slider.
    3. Drag on the view to look round.
    4. Pull the throttle through neutral to astern.
    5. Stop the engine.
    
    Try the landing craft too: the **Switch to** button (added after the first test, below).
  - **Desktop:** add `?touch=1` to the address to see the same controls and drive with the mouse.

### Touch controls, after the owner's first phone test: panning, and switching boats (done, on /next/)

- **What went wrong:** touching the middle of the screen "stole the cursor" and the view wouldn't pan. A tap on the scene asked the browser to capture the pointer (the desktop's mouse capture). Captured, the finger's drag went to the console controls under the centre reticle, not to the view. And the page could take a drag for itself as a scroll.
- **Now:**
  - a touch never captures the pointer;
  - one finger dragged anywhere except on a button or slider turns the view, from the very first touch (no tap first), even if it starts on the speed readout or a notice;
  - the page no longer scrolls or zooms under a finger.
  
  A mouse click on a desktop still captures the mouse as before.
- **Switch boat:** a new button, **Switch to (the other boat)**, starts the game again in the workboat or the landing craft (the page's `?boat=`), at her helm. It's for testing.
  - **Correction:** the boat you start in is in the page address, not stored. So https://tartanski-cpu.github.io/SWVR/next/?boat=landingCraft opens straight into her.
- **Checked:** on the emulated phone, with real touch events:
  - a drag straight after loading turns the view;
  - a tap in the middle captures nothing, and a drag after it still pans;
  - a drag starting on the readout pans;
  - Switch reloads into the landing craft at her helm, with the button now offering the workboat.
  
  On the desktop, a click still captures the mouse. All 483 tests pass.

### Throttle lever: a wider, stickier neutral notch with a firmer click (owner VR test; done, on /next/)

- **The owner:** in VR, neutral was hard to find on the throttle lever; it often slipped through into ahead or astern. Can the click into neutral be felt more?
- **Why:** the notch was only 2.4° each side of upright (6 % of the 40° travel), and the haptic pulse going in was half strength for 35 ms.
- **Now** (`CONFIG.modules.throttleLever`, `controls/Lever.ts`):
  - **Wider:** the notch catches the lever within 6° each side (`detent` 0.15).
  - **Sticky:** once in, it holds until you push about 2.4° further, to 8.4° (`detentHold` 0.06), so a hand resting on it doesn't knock it out.
  - **Firmer click:** going in gives a full-strength 70 ms pulse (`click`), coming out a light one (`release`).
- **Side effect:** the slowest ahead or astern is now just past 8.4° of lever, not 2.4°. Just out of the notch, she runs a touch above idle in gear (about 8 % of the rpm range at most). Tell me if dead-slow manoeuvring feels too quick; `detent` and `detentHold` tune it.
- **On the desktop:** a mouse drag still stops in the notch and needs a deliberate extra push to go through. Once through, it lands just past the sticky edge.
- **Tests (1 new, 484 in all, all pass):** the notch catches at 5°, holds at 8°, lets go at 9°, and the pulses are the configured ones. Golden runs unchanged (the lever's feel isn't in the simulation).
- **Owner test, VR:**
  1. Grab the throttle and move it slowly through upright. You should feel a strong click as it drops into neutral.
  2. Rest your hand on it: it should stay put.
  3. Push a little further, and it goes into gear with a light tick.

### Landing craft: a quiet idle on a phone, the sound dipping on throttle-up, banking into turns (owner phone test; done, on /next/)

- **No engine sound at idle on the phone (earbuds):**
  - **Why:** her idle beat is ~40 Hz, below what earbuds and phone speakers can play. VR speakers manage it.
  - **Fix:** with the touch controls (phones, tablets), the engine is voiced for small speakers. Its harmonics around 240 Hz are lifted 9 dB, and its tone opened 160 Hz, so the ear hears the deep beat from the harmonics (`CONFIG.engineSmallSpeakers`).
  - **Result:** at idle, ~7 dB more in the range earbuds play.
  - VR and desktop are untouched: the filter sits flat there.
- **The sound dying for a moment on throttle-up:**
  - **Why:** the clutch went in, and the 0.6 m propeller loaded the engine before her governor could add fuel. It was limited to 0.45 of full rack a second, the workboat's old naturally aspirated engine's figure. The revs sagged from 590 to 400 rpm, and the sound with them.
  - **Fix:** her turbo diesel's governor now adds fuel at 2.0 a second (her recipe's `rackRiseRate`). The sag is about 75 rpm and brief, and the rising load makes the sound louder as it happens.
  - **The workboat is unchanged:** she sags to ~440 rpm too, but the VR lever moves gradually and you were happy with her.
- **Leaning out of turns:**
  - **The owner:** like a displacement boat, she heeled out of turns, but a planing boat leans in.
  - **Why she leaned out:** the game had only the displacement mechanism. Her CG swings round above the water's side force on the hull, which heels her out.
  - **What makes a planing hull lean in:** turning, she slides outward through the water. The outer half of her vee bottom meets the water at a steeper angle and lifts more than the inner half, and that rolls her into the turn.
  - **How it's modelled now** (`vesselPhysics.ts`, a hull's `planing`): a pair of vertical forces at her chines, `bank` x 1/2 rho Awp U v (forward speed times sideways slip), up on the side she's sliding toward and down on the other. It fades in from Fn 0.3 to 0.7 (~5 to ~13 kn).
  - **Result:**
    - helm 40 % at 16 kn: ~6.5° into the turn (was 8.5° out);
    - thrown hard over at 20 kn: she leans in up to ~15° as she carves in, then settles nearly upright (was a 20° lurch out, then 7° out).
  - Only the landing craft has it; the workboat is a displacement boat and is unchanged.
- **Still to come with real planing:**
  - hard over she bleeds speed to ~9 kn, more than a planing boat would (the hull's sideways drag is a displacement hull's);
  - no running trim or rise at speed.
- **Config:** `CONFIG.vessels.landingCraft.planing` (`bank` 0.06, `fnStart` 0.3, `fnFull` 0.7), `CONFIG.engineSmallSpeakers`, her recipe's diesel `rackRiseRate` 2.0.
- **Tests (1 new, 485 in all, all pass):** she leans 3-12° into a moderate turn at speed, and the workboat has no planing. Workboat golden runs and sea trials unchanged; her straight-line trials unchanged (20.0 kn).
- **Owner test:**
  1. On the phone, listen at idle (earbuds) and as you throttle up from neutral: the sound shouldn't dip.
  2. Flat out, put the helm over halfway, then hard: she should lean into the turn.
  3. In VR, the workboat should sound and handle as before.

### Shipyard, stop 1: the design page and the code (owner plan; done, on /next/ for the owner to test)

- **The owner's plan:** a separate Shipyard web page. Pick a hull type, add a wheelhouse, size and place things with sliders, add a controls package (basic or advanced) and an engine. When she's complete, the page gives a code; in the 3D game you enter the code at the boatyard, pay, and she's spawned fully built.
- **Agreed:**
  - the code holds the choices, not the boat, and is kept short enough to type in VR;
  - old codes may have to be redone if the rules change a lot;
  - three stops:
    1. this page, the code, and a temporary "try her in the game";
    2. buying her at the boatyard in the game;
    3. placing controls by hand on 2D plan / side / inside views.
- **The page:** https://tartanski-cpu.github.io/SWVR/next/shipyard.html (`shipyard.html`, `src/shipyard/page.ts`).
  1. **Hull type**, three the game can float and drive today:
     - the landing craft (9 m, with her bow ramp);
     - the hull study's gillnetter (9.75 m, beamy and shallow);
     - the workboat's 12 m displacement hull.
     
     Sliders: length, beam, depth (each 80 to 117.5 % in 2.5 % steps) and bulwark height (0.3 to 1.0 m).
  2. **Wheelhouse:** its position along the free deck (right aft to right forward), length (2.4 to 5.4 m), width (65 to 100 % of what the side decks leave), headroom (1.9 to 2.6 m), and a step-down floor.
  3. **Engine:** 150 kW straight six, 280 kW V8 or 400 kW V8, each with its own sound.
  4. **Controls:**
     - **Basic:** wheel, throttle, key / heat / start, speed with depth, rpm.
     - **Advanced:** adds lights, wipers, horn, searchlight, heading, engine monitor and the VHF.
  5. **Paint:** eight liveries.
  
  As you go:
  - **a 3D view** drawn by the game's own hull and module code: bow, side, stern, plan and **at the helm**, with the water on or off;
  - **her figures:** length x beam, displacement, draught, GM, propeller, gearbox, price;
  - **plain-language warnings;**
  - **the game's own sea trials, run on her:** top speed and rpm, three-quarter speed, fuel and range, acceleration, turning circle, crash stop, bollard pull, roll period.
- **The code:** 10 characters, like `4H228-BQ98A` (`src/shipyard/design.ts`).
  - Every choice is a step on a fixed scale: 45 bits, 9 characters of Crockford base 32, which has no I, L, O or U, so nothing looks like anything else.
  - The 10th is a check character, so **any one mistyped character is caught** rather than giving the wrong boat.
  - Forgiving as typed: any case, the dash optional, I/L read as 1, O as 0.
  - It carries a rules version (1), so a later change can upgrade or refuse old codes with a reason.
- **How a design becomes a boat** (`src/shipyard/build.ts`, used by both the page and the game, so the code gives exactly the boat designed):
  - **Shape:** the base hull scaled: the study's curves (length along, half-breadths across, sheer and keel up), or the workboat's chine parameters.
  - **Weight:** what her stations displace at the design waterline, so she floats on her lines. The CG is over her LCB (level trim), at 63 % of her depth amidships (a little higher with a taller house).
  - **Radii of gyration:** roll 0.39 B, pitch 0.28 L, yaw 0.29 L.
  - **Damping:** the planing hulls take the landing craft's per-area figures, the displacement hull the workboat's. Roll is 28 % of critical, from her own GM. The resistance curve is on her own waterline length. The planing hulls bank into turns.
  - **Wheelhouse and fit-out:** placed within the free deck. Its insides (console, panels, buttons, hatch, engine) are placed from it as on the landing craft. The console's dash is widened or narrowed to the cabin.
  - **Machinery:** the engine's torque curve scaled from the landing craft's (all rated 1,800 rpm). The propeller is as big as her draught aft allows and her engine can turn (0.68 m at 150 kW to 1.05 m at 400 kW). The rudder is 0.07 x waterline length x draught; the tank is sized to the engine.
  - **Her recipe** is the landing craft's, with all that put in.
- **Matching the propeller by trial** (`src/shipyard/trial.ts`): the gearbox is chosen so flat out settles just under rated rpm (93 %), by a halving search over 16 gearbox steps (1.0 to 4.18, 10 % apart): four or five 45-second full-throttle runs.
  - It and the sea trials run in a background worker, so the page never freezes: about 3 s after a change.
  - Matched examples:
    - landing craft: 11.0 / 19.9 / 26.9 kn on 150 / 280 / 400 kW;
    - gillnetter (15 t): 8.6 / 11.8 / 15.3 kn;
    - 12 m workboat hull (18.5 t): 8.0 / 9.7 / 14.7 kn.
- **Trying her in the game:** the page's "Try her in the game" opens the game with `?design=CODE`. She's the vessel type `design` (one designed boat at a time), built at startup. A bad code says why and starts in the workboat.
- **Shared code:**
  - the boat library has the `design` type (`useDesign` in `boats/sims.ts` rebuilds her and her machinery);
  - `VESSEL_IDS` gains `design`;
  - Vite builds a third page and an ES module worker.
  - Nothing changes for the existing boats: workboat golden runs and draw calls are unchanged (62 / 57 / 115 / 36 by day, 65 / 58 / 116 / 35 at night).
- **Config:** `CONFIG.shipyard` (`matchRpm` 0.93, `runSeconds` 45). The base hulls, engine packages and liveries are in `src/shipyard/build.ts`; the scales in `src/shipyard/design.ts`.
- **Tests (9 new, 497 in all, all pass):**
  - codes: round trips for every choice at every step, forgiving typing, every single-character typo caught;
  - every hull with every engine floats level (sinkage and trim under 2 cm), GM over 0.5 m, valid recipe, no warnings;
  - the slider ends build;
  - the packages hold what they should;
  - only the landing craft has the ramp;
  - the gearbox matches by trial and she drives.
- **Checked in the browser:**
  - the page loads; its trial finishes in ~3 s;
  - switching to the workboat hull with 400 kW re-matched her gearbox (2.85:1) and gave 14.7 kn;
  - screenshots of the default and the workboat design, and the helm view;
  - her code in the game: she starts in the designed boat (navy, basic dash), casts off, starts and gets under way.
- **Known limits:**
  - the round-bilge hulls, catamarans and forecastle hulls can't be chosen until the game's stations take them;
  - the weight comes from her lines, not a weight estimate;
  - no deck gear (crane, winch) yet;
  - one designed boat at a time in the game;
  - not in multiplayer (6d);
  - she isn't saved with a career until stop 2.
- **Owner test** (desktop or tablet, then VR):
  1. Open the Shipyard page and try each hull, the sliders and the step-down floor. Watch the figures and trial change.
  2. Pick an engine and see the gearbox match.
  3. Look at her at the helm.
  4. Copy the code, then press "Try her in the game".
  5. In VR, open https://tartanski-cpu.github.io/SWVR/next/?design= followed by the code, on the Quest, and drive her.
  6. Your eye: the shapes, the weight and CG assumptions, the speeds.

### Shipyard, stop 1b: the bow choice, plumb to raked (owner; done, on /next/, not yet tested by the owner)

- **The owner asked:** in the Shipyard's first version, a simple slider for how raked the bow is, or plumb. The transom stays as it is for now. Control-point hull editing is parked: a limited set of variants keeps the codes short enough to carry into the 3D game.
- **The slider** (Hull section, "Bow"), five steps: **plumb, near plumb, as designed, raked, well raked**.
  - **How the game makes rake:** its stations are upright sections (the same ones float her and draw her), so a raked bow is her forefoot: the keel line sweeps up to the stem from further aft while the deck keeps its length and overhangs it. Plumb keeps the keel deep to the stem.
  - **The steps** (`shipyard/build.ts bowKeel`):
    - **plumb:** the keel held at its depth from 55 % of her length to the stem;
    - **as designed:** her own keel line, exactly;
    - **raked / well raked:** cut away from 45 % / 35 % of her length forward, rising to 0.3 m under the stem's deck edge (never deeper than her own);
    - **near plumb:** halfway between plumb and her own.
  - **On the 12 m workboat hull:** her chine generator's forefoot is now a setting (`HullParams.forefoot {from, rise}`). Its default is the old rule exactly, so the workboat herself is unchanged (golden runs equal).
  - **Her weight and handling follow,** since the builder works them out from her stations: a more raked bow is a little less displacement and a shorter waterline, and her sea trial shows it.
- **The code stays 10 characters, with a 5-step bow:**
  - **Correction:** my earlier count (that packing tighter frees ~1.8 bits) was wrong: I'd dropped a factor of 16. The choices with a 5-step bow come to ~1.24 x 10^13 combinations, more than 42 bits after a 3-bit version label.
  - **What's done instead:** the code is one 45-bit number, and each version owns a range of it. Version 1's codes are 2^42 to 2^43. Version 2 (the bow) takes ~1.24 x 10^13 from 2^43. The rest, up to 8 x 2^42, is left for later versions.
  - The choices are packed mixed-radix: each uses exactly its own number of steps, a 3-way choice 1.6 bits rather than 2.
  - **Version 1 codes still read,** as the same boats with the bow as designed. The two real codes from the first test (`4H228-BQ98A`, `6H22N-3QNJ7`) are in the tests.
- **Tests (3 new, 500 in all, all pass):**
  - the choices fit version 2's range;
  - version 1 codes read back;
  - every bow step builds on every hull and floats level, displacement and waterline never grow as she gets more raked, and "as designed" is exactly the landing craft's 7.85 t.
  
  Workboat golden runs unchanged.
- **Checked in the browser:** side views of all three hulls plumb / as designed / well raked: the plumb stems are upright with the forefoot carried full depth; the raked ones cut away from further aft.
- **Owner test:** on the Shipyard page, move the Bow slider on each hull and look at her from the side, with the water off. Watch her displacement and her sea trial change. Then take her code into the game.

### Fix: stray window posts standing on the deck (owner, from a Shipyard screenshot)

- **What it was:** each wheelhouse side wall's window mullion was placed at a fixed spot, z -0.16 m. That's right for the workboat's wheelhouse, which spans it, but on the landing craft and most Shipyard designs the two posts stood on the open deck, detached from the house.
- **Fix** (`vessel/view/hullMesh.ts`): the mullion stays at -0.16 where the house spans it (the workboat, unchanged), and is otherwise halfway along the side.
- **Checked:**
  - Shipyard views of the landing craft, a workboat-hull design with the house forward (the owner's case) and the gillnetter: no stray posts;
  - all tests pass.

### Shipyard: the pilot boat hull, the bow as a stem angle (0-50 deg), fine-entry fixes (owner; on /next/)

- **The owner asked:**
  - add the pilot boat style of hull;
  - call the workboat hull semi-displacement (a fine entry with a chine; geometry unchanged);
  - fix her raked bow, which looked weird.
  
  Then, seeing the tests: the rake should go from plumb (0 deg) to 50 deg and no further. The keel was being cut away far too far back, and that's why the shape didn't resolve.
- **The bow choice is now the stem's rake from vertical:** 0 (plumb), 12.5, 25, 37.5 or 50 deg (`SCALES.bow`).
  - The stem is a straight line from 0.15 m under the stem head down at that angle until it meets the keel. The keel runs at full depth to it: the hull's own keel, held at its depth forward of 55 % of her length.
  - So at 50 deg a 2 m deep bow's forefoot is cut back about 2.4 m: on the 12 m hull about 2.9 m, where the old "well raked" cut it back up to 7.8 m.
  - The same rule on all four hulls (`shipyard/build.ts bowKeel`; for the workboat's chine generator, `HullParams.forefoot.stemDeg`).
  - "As designed" is no longer a step. Version 1 codes read with the middle step (25 deg), so their bows differ a little from before.
- **Fine entries drawn properly:**
  - **The vee:** where the keel rises within 0.6 m of the chine, the chine closes in to it, so the bottom fines into a vee instead of staying a wide flat plank (which folded over one station and left a gap).
  - **The wheelhouse walls** reach 0.15 m under the deck, no further (`hullMesh.ts`): lower down, a fine entry's hull is narrower than the house and the walls showed through her topsides. A sunk floor's walls go down to the floor, so the Shipyard keeps a step-down floor only where her hull is wide enough down there; otherwise the floor stays level and the page says why.
  - **The engine space** is no deeper than her bottom allows under the hatch's sides, not just at her keel.
  - The workboat and landing craft themselves are unchanged (golden runs equal).
- **The pilot boat** (4th hull type): the hull study's 14 m pilot / crew boat, deep-V, fine entry, well-raked stem.
  - The game's stations take one chine, so her spray chine is left out; her main chine, deep-V and flare stay.
  - She's added at the end of the hull list. The hull choice is the leading part of the code, so **every earlier code still means the same boat**.
  - **Flag:** floating on the study's design waterline (draught 1.1 m) she displaces 28.6 t, so even the 400 kW engine gives only 12.2 kn (9.0 / 10.9 / 12.2 kn on 150 / 280 / 400 kW). A real 14 m pilot boat (~20 t) has twin engines of ~450 kW or more.
    - **Options:** a bigger engine package (changes the code layout: a new version), twin engines (a modules job), or a lighter, shallower pilot hull (a shallower design waterline).
- **The workboat hull's description:** "12 m semi-displacement, hard chine, fine entry".
- **Tests (500, all pass):**
  - every bow angle on every hull builds and floats level;
  - more rake never adds displacement or waterline;
  - even at 50 deg her keel is at full depth from 70 % of her length aft.
  
  Workboat golden runs unchanged.
- **Checked in the browser:** side and bow views of all four hulls at every bow angle: straight raked stems, no gaps.
- **Owner test:** on the Shipyard page:
  1. Pick the pilot boat and the workboat hull.
  2. Move the Bow rake from plumb to 50 deg and look from the side and the bow, with the water off.
  3. Run the pilot boat's trial on each engine.

### Shipyard: twin engines, 11-character codes, the pilot boat's own layout (owner)

- **Twin engines** (a tick box under the engine): two of the chosen engine package side by side, worked together from the one throttle and gear lever.
  - Modelled as two identical engines in lockstep, so one engine state drives both (`dieselInboard`, `engine.twin = { x }`). Each propeller pushes at its own shaft line, ±x off the centreline (28 % of her deck beam either side). They turn opposite ways, so no prop walk.
  - Doubled: fuel burn, engine mass, physical power, the fuel tank. The rudders' area is doubled; each rudder sees one propeller's wash. The propeller diameter is also limited by the shaft spacing.
  - Sound: one engine voice, louder by `CONFIG.engineTwinLevel` (1.4).
  - Not modelled: separate port and starboard levers (no twin-screw manoeuvring yet), or one engine failing alone.
- **Codes are now 11 characters** (version 3, e.g. `0W7ZK-EPD4SN`): twin engines didn't fit in what was left of the 10-character range. Old 10-character codes still read, with a single engine (`design.ts`, tests for v1 and v2 codes).
- **Each hull type starts from her own layout** (`DESIGN_HULLS[i].defaults`), applied when you pick her: the landing craft as in the game; the gillnetter with her house aft; the workboat with her house forward.
- **The pilot boat now follows the hull study's pilot:** her keel rocker is kept (only held deep forward of 75 % of her length), her sections are set upright so her deck length doesn't change with the bow rake, and she starts with a long wheelhouse amidships (Targa / Safehaven style), bow 50 deg, twin 400 kW. About 27 kn, 24.3 t, GM 1.18 m.
  - Her spray chine: see the next entry.
- **Checked:** typecheck; all 503 tests; side and bow screenshots of all four hulls with their starting layouts.
- **Owner test (desktop or phone):** on the Shipyard page, pick each hull type and see her starting layout. Pick the pilot boat, run her trial with and without Twin engines, then **Try her in the game** and check she runs and sounds right. Type an old 10-character code into **Load a code**: it should still open. **In VR:** start the game with `?design=` and an 11-character code.

### Shipyard: the pilot boat's spray chine, drawn only (owner)

- **The owner asked** for the study pilot's double-chine hull form, with the second (spray) chine decorative: buoyancy and seakeeping are worked on the main chine.
- **How:** a lofted hull with two chines takes the lower as her hard chine and the upper as her spray chine (`hullFormFromDesign`). Her sections stay five-point outlines, so her hydrostatics, planing and damping are as before. Each station carries the spray chine's half-breadth and height (`Station.spray`); the hull mesh draws her topsides through it, and her transom outline with it (`hullMesh.ts`). It's still one draw call, with a few dozen more triangles.
- **Other boats:** they have no spray chine, and their hulls are drawn exactly as before.
- **Checked:** typecheck; all 504 tests (a new one: the spray chine sits between the chine and the deck edge, outboard of the chine, and the sections keep five points); screenshots of the pilot from the bow and the stern, with the water on and off.
- **Owner test:** on the Shipyard page, pick the pilot boat, turn the water off and look along her side and at her transom: a second knuckle runs above the chine. It's drawn in the topside colour, so it shows as a change of light on her side, not a coloured line.

### Pixel painting, step 1 (owner: Stormworks-style detail without extra geometry)

- **What it is:** small, low-resolution greyscale images ("tiles") painted on the boats' flat panels as crisp pixels. Each tile multiplies the part's own colour, so it takes any livery.
- **How (`src/render/pixelPaint.ts`):**
  - **The tiles are generated in code at start-up**, 64 x 64 pixels each, seeded so they're the same every time. There are no files to download, and they take ~0.1 MB of texture memory.
  - **The five tiles:**
    - plating: 1 m strakes and 2 m plates, staggered butts, weld seams;
    - nonSlip: deck grit;
    - wood: 12.5 cm planks;
    - mat: floor speckle;
    - chequer: tread plate.
  - **Each part names its tile:** `part(shape, colour, 'plating')` (`render/geometryUtils.ts`). `mergeParts` works out where each face falls on its tile, square-on in metres, so the pixels are the same size everywhere.
  - **The shared material** (`flatVertexColorMaterial`) draws them. Its pixels stay crisp up close, but their edges blend over about one screen pixel, and they average out with distance (mipmaps). This is so they don't crawl in VR.
- **Where they're used:**
  - every hull: plating, with the non-slip on the deck;
  - wheelhouse walls inside: wood lining in a new livery colour `lining`, plus a wood ceiling;
  - wheelhouse floor: matting;
  - the engine hatch lid: chequer plate.
- **Window frames are real geometry, not paint:** a black band (`frameWidth`, in the new livery colour `frame`) along the panels above and below the glass, and black mullions and corner posts. That's crisper than painted lines and costs a few boxes.
- **Config (`CONFIG.pixelPaint`):**
  - `strength` (0 turns it all off, 1 full);
  - `tileMetres` (how much surface each tile covers);
  - `frameWidth` (0.06 m).
- **Cost:**
  - **Draw calls are unchanged** (measured in the headless browser at the start view: workboat 246, landing craft 154, the same before and after).
  - **Triangles:** about +380 on the workboat and +260 on the landing craft.
  - **Fragment cost:** one texture read per pixel drawn on painted parts.
  - Not yet measured on the Quest.
- **Checked:**
  - typecheck;
  - all 506 tests (new: each tile averages mid-grey, so it adds detail without darkening a colour; painted parts carry their tile and metre coordinates);
  - screenshots of the workboat and the landing craft inside and out.
- **Owner test:**
  - **In VR:** look at the window frames, the wood lining and the hatch up close. Then walk the deck and look along it and at the hull from the quay. Watch for shimmer or crawling as you move your head. Note the frame rate on the debug panel.
  - **On desktop:** the same views. Tell me what's too strong or too faint; each tile's size and the overall strength are config numbers.
- **Fix (owner, desktop):** the window pillars flickered (z-fighting): where a black frame piece overlapped a white wall panel (a front corner post over the front wall's end, or over the raised wall beside the console), their faces shared a plane. Frame pieces now stand 4 mm proud of the walls all round (`FRAME_PROUD`, `hullMesh.ts`). Checked in close screenshots of the front corners of the workboat and the landing craft.
- **The owner saw no painting on the Quest:** most likely that tab had loaded the build before this one (the desktop, later, had it). The Quest draws the boats with the same material as the desktop, with no VR-only path. To check which build is loaded, look at the commit in the NEXT menu header.
- **Step 2 (not started):** weathering (rust streaks under scuppers and fittings, grime at the waterline), perhaps a wear setting.

### Shipyard: a curved stem on the lofted hulls (owner)

- **The owner said** the pilot boat at the maximum rake still looked like too much. It measured 50 deg from vertical, as specified, but as a straight line about 2.8 m long, ending in a hard knuckle about 3.3 m back. Offered a curved stem like the hull study's pilot; the owner chose it.
- **The stem now (`bowKeel`, `shipyard/build.ts`):**
  - It still meets the keel at the same place, so the slider is the rake from the stem head to the forefoot (0-50 deg). The keel isn't cut further back, as the owner asked earlier.
  - In between it is full forward: a parabola in profile, steeper at the deck (atan(tan deg / 2): 31 deg at the maximum) and running into the keel along it, with no knuckle.
  - Applies to the landing craft, gillnetter and pilot boat, so their codes' bows change shape a little. The workboat's own chine hull keeps its straight stem (`hullForm.ts`), which the owner liked plumb.
- **Checked:** typecheck; all tests (the bow test still finds the keel unchanged aft of the forefoot); side profiles of the pilot at 0, 25 and 50 deg; the landing craft and gillnetter at their defaults.
- **Owner test:** on the Shipyard page, pick the pilot boat, turn the water off, look from the side and move the Bow rake from plumb to 50 deg.

### Shipyard: the pilot boat's forefoot and chines (owner)

- **Owner:** a nick just aft of the bottom of the stem; the bottom paint and the spray chine kicked up at the bow.
- **The nick:** the keel was held level forward of 75 % of her length, but her own rocker still rises there, so the slope jumped where the two met. Now forward of 60 % the keel runs straight on at the rocker's own slope, and the curved stem (a parabola added to that line) runs into it with no change of slope (`bowKeel`, `shipyard/build.ts`). The bow test still holds: the keel aft of the forefoot is the same at every rake.
- **The kick-up:** chine heights are a share of the depth from keel to deck (the hull study's loft). As the keel swept up the stem, the depth shrank and both chines were dragged up with it.
  - New optional `chineKeel` (`hulls/loft.ts`): the line the chine heights are measured from. The pilot boat uses her uncut keel line, so her chine and spray chine run on smoothly to the stem, closing in where the forefoot rises within a fifth of the depth of them.
  - The landing craft and gillnetter keep chines that sweep up with the forefoot. With her chine closed in, the landing craft's square bow lost its buoyancy (GM fell to 0.22 m, and the stability test caught it).
- **Checked:** typecheck; all tests; side and bow views of the pilot at 0, 25 and 50 deg.

### Engine start: the glow plugs preheat with the key; an oil-pressure buzzer (owner)

- **The owner's procedure** (as on most small diesels): master, breakers, key on. The oil-pressure alarm sounds and the GLOW lamp lights by itself. Wait a few seconds for it to go out, then START. There's no HEAT button any more.
- **Ignition (`ignitionStep`, `vessel/physics/propulsion.ts`):**
  - With the key on and the engine stopped, the glow plugs heat on their own (a preheat timer) until they're hot enough (`preheatTime` cold, `preheatHotTime` warm). They're then held hot until she starts or the key goes off, and cool after.
  - The `ignition.heat` key still works (extra heat while held), but no boat has the button.
- **Lamps (`busKeys.ts`):**
  - GLOW is lit from key-on until the plugs are hot.
  - OIL and CHARGE are now fed through the key, as on a real panel. They light when the key goes on, not just with the INSTR breaker.
  - The glow plugs' 35 A draw follows the GLOW lamp (`dieselInboard`).
- **Buzzer (`App.ts`):** it sounds with the key on and the engine stopped (no oil pressure), with the INSTR breaker on, and stops when she runs.
- **Removed:** the HEAT button from the workboat and landing craft recipes, and from the Shipyard's basic controls.
- **Wording updated:** the start card, the start-up checklist step ("Key ON, wait for the GLOW lamp to go out"), the tutorial line, the desktop hint and the README.
- **Golden runs re-recorded,** with only these changes: OIL and CHARGE off with the key off, one tick more preheat in the cold start, and battery charge differing in the 5th decimal place from the plugs' draw.
- **Tests:** the console has 21 parts and 3 button caps; the load list draws the plugs with the key on and the engine stopped; a new ignition test covers the lamps, preheat, the held heat and the cool-down; the bus key table is regenerated. 507 tests pass.
- **Owner test:**
  - **In VR:** master on, INSTR on, key on. You should hear the buzzer and see the GLOW lamp lit. When it goes out, hold START: she runs and the buzzer stops.
  - **On desktop:** the same with the mouse.

### Shipyard: the wheelhouse's shape and floor height (owner)

- **The owner asked** for control of the house's shape, from a photo of a Dutch-style patrol boat:
  - the roof: a visor reaching over the front windows, and its rake;
  - the front windows' rake (raked aft for a fast patrol boat, through upright, to a pilot house's reverse rake);
  - the front below the windows, upright or leaning forward, its top meeting the windows' foot;
  - the house's height, set by its floor (the inside keeps its headroom).

  The roof ladder and rail are dropped from designs, to keep it simple. Agreed: 13-character codes with the finer steps, and a floor from 0.6 m below the deck to 0.8 m above it, with steps.
- **The choices (`design.ts`, version 4; `SCALES`):**
  - floor: -0.6 .. +0.8 m in 0.2 m steps; it replaces the step-down tick box;
  - visor: 0 .. 0.6 m;
  - roofRake: -6 .. +6 deg (+ rising forward);
  - windowRake: -30 .. +30 deg (+ leaning forward: reverse rake);
  - lowerFront: 0 .. 30 deg forward.
- **Codes:** now 13 characters (60 bits, ~13 % used), shown as XXXXX-XXXXX-XXX. Old codes still read:
  - versions 1-3 (10 and 11 characters) come in as the old box house;
  - a step-down floor becomes floor -0.2 m, and none becomes level.
- **Each hull type's starting shape:**
  - landing craft and gillnetter: upright;
  - workboat: windows reverse-raked 15 deg, 0.3 m visor;
  - pilot boat: windows reverse-raked 15 deg, 0.3 m visor, roof rising 3 deg forward.
- **Drawing (`buildShapedHouse`, `vessel/view/hullMesh.ts`), used only for a layout with a `shape`** (the game's workboat and landing craft keep `buildWheelhouse`, and their golden runs are unchanged):
  - **Front profile:** upright up to the deck (`lowerFromY`), then leaning forward up to the front glass's sill, then the windows at their rake, then a header up to the roof.
  - **Side walls:** they follow the front profile (extruded outlines, `prism`), so their windows are trapezoids. The side and aft windows start at 1.0 m and the front at the dash top (1.31 m), with a black corner post between.
  - **Roof:** sheared to its rake about the middle of the house, reaching to the visor.
  - **Shared with the box house:** the frames, wood lining, floor and console (now `frameKit`, `buildFloor`, `buildConsole`).
  - **Rain glass and wipers:** `frontRake()` now carries the windows' foot forward by the lower front's lean (`ahead`), so they sit on the raked panes.
- **Floor and steps (`shipyard/build.ts`):**
  - **Floor height:** raised from the highest deck under the house, or sunk from the lowest. A floor too low for a fine hull comes up in 0.2 m steps, with a warning.
  - **Steps:** a rise at the aft door of over 0.35 m (a player steps up 0.4) gets steps, `wheelhouse.steps`. A raised floor's steps are outside; a deep sunk floor's are inside, with the engine hatch moved forward clear of them.
  - **Walking (`layout.ts`):** the steps are walk surfaces. A deep sunk floor's doorway is a threshold at deck height. The deck is kept clear of a forward-leaning lower front.
  - **Weight and windage:** the CG and the windage follow the floor height.
- **No ladder:** `ladder` is now optional for a wheelhouse (`hasWheelhouse`, `vesselWalkArea`, `hullMesh`). Without it the roof isn't walked.
- **Roof fittings follow the roof's rake and front edge:** the searchlight, horn, nav lights and VHF. The sidelights sit on the house sides just aft of the header.
- **Page:** five new sliders under Wheelhouse (Floor height, Front below, Windows, Roof visor, Roof rake). The code box takes 13 characters. `window.shipyard.look(eye, at)` is there for scripted screenshots.
- **Checked:**
  - typecheck; all 509 tests:
    - codes v4, with v2 and v3 codes reading as the box house;
    - every floor height on every hull: no step over 0.35 m, and walking in at the door along the centreline reaches the floor;
    - the shape's extremes build with a sound window band and door;
  - golden runs unchanged;
  - screenshots in the Shipyard of a patrol shape (windows raked aft, front below leaning 22.5 deg, visor, roof down forward, floor +0.4), the pilot's default, a raised floor (+0.8) and a sunk one (-0.6), from the side, bow, stern and helm;
  - a design opened in the game with no errors.
- **Not done:** walking into a design in VR or on desktop by hand; the shape's interior shell (the VR fade in walls) still treats the front as upright.
- **Owner test:**
  - **Desktop or phone:** on the Shipyard page, try the five new sliders on each hull, from the side, the bow and At the helm. Raise the floor to +0.8 and look at the steps from Stern 3/4.
  - **In VR:** open a design (`?design=` and its code), walk up the steps into the house, and check the view over the bow from the helm.

### Shipyard: the roof as one slab (owner)

- **The owner said:** the roof should be one flat slab, not raked. The "rake" he wants is only the slab's forward edge, cut back underneath steeply or less, and with a few set options rather than sliders. Thickness also as two or three settings.
- **Now (`design.ts` version 5, still 13 characters):**
  - `roofThickness` (0.1 / 0.2 / 0.3 m) and `roofEdge` (square / 30 / 45 / 60 deg from vertical) replace `roofRake`; the visor slider stays.
  - Version 5 codes sit above 2^59; version 4 codes (below it) still read, with the roof 0.1 m and square.
- **Drawing (`buildShapedHouse`):** the roof is one prism, flat at `roofY`, `roof.thickness` thick, from the visor's edge to aft of the house. Its front face runs from the top edge back to the underside at `roofEdgeDeg`, cut no further back than the visor reaches, so not into the header. The header and the side walls above the windows are flat-topped boxes again. `HouseShape.roofRakeDeg` became `roofEdgeDeg`.
- **Roof fittings** (searchlight, horn, masthead) stand on the slab's top, whatever its thickness.
- **Starting roofs:** landing craft and gillnetter 10 cm, square; workboat 20 cm, 30 deg; pilot boat 20 cm, 45 deg.
- **Page:** Roof and Roof edge are rows of option buttons (`options()` in page.ts).
- **Checked:** typecheck; all tests (new: version 4 codes read with the default roof; the shape's extremes now include the thickest roof with a 60 deg edge, with and without a visor); screenshots of a patrol shape (30 cm, 45 deg, visor 0.45 m) and the pilot's default from the side, bow, stern and helm; the page's option rows.
- **Owner test:** on the Shipyard page, try Roof and Roof edge with the visor at 0.3 m or more, from the side.

### Shipyard: the "front below" choice withdrawn (owner)

- **The owner:** the lean of the front below the windows wasn't doing what he wanted. Leave it for now.
- **Removed:** its slider is gone from the page, and the build always draws that front upright (`lowerRakeDeg: 0`).
- **Kept:** its place in the code (`lowerFront`), so codes stay 13 characters and version 5. Any code reads it as 0, so an older code with a lean comes in upright. The lean's drawing (`buildShapedHouse`, `frontRake`'s `ahead`) and the walk area's allowance stay, ready if it comes back.
- **Checked:** typecheck; all 510 tests (the round-trip test now expects the lean read as 0); a screenshot of a design that had a lean, now upright, and of the page.

### Shipyard: the roof's front edge rakes back; no square edge (owner)

- **The owner, with a marked-up screenshot:** the roof's front face should always go back as it rises, like a raked windscreen. The edge is never square.
- **Now (`buildShapedHouse`):** the slab's underside reaches furthest forward, to the visor's edge. Its top is set back by `thickness x tan(roofEdgeDeg)`. That's the opposite of the undercut it had.
- **Options:** the page offers 30, 45 and 60 deg. `roofEdge` keeps its 4 steps in the code, so codes are unchanged; index 0, square before, reads as 30 (`SCALES.roofEdge`, and decoding lifts 0 to 1).
- **Starting roofs:** the landing craft and gillnetter now start at 30 deg.
- **Roof fittings** forward (searchlight, horn, masthead) stand clear of the set-back top edge.
- **Checked:** typecheck; all 510 tests (round trips now expect a square edge read as 30 deg); screenshots of a 30 cm roof with a 60 deg edge on the landing craft, the pilot's default, and the page's buttons.

### Hull plating dropped; the Shipyard roof's colour (owner)

- **No plating on the hulls:** the owner says workboats are mostly GRP, or aluminium in big sheets, so plate seams look wrong. The hull mesh paints topsides and bottom plain (`hullMesh.ts`). The plating tile is gone from `pixelPaint.ts` and `CONFIG.pixelPaint.tileMetres`. Decks keep their non-slip; the cabins keep wood, matting and the chequer-plate hatch. Draw calls are unchanged.
- **Roof colour (`roofPaint`, `ROOF_PAINTS` in `shipyard/build.ts`):** Like hull (her topsides colour, the default), Orange (common on workboats), White, Grey or Black. It's a row of swatches under Paint, and the "Like hull" swatch follows the hull's paint.
- **Codes now 14 characters** (version 6: 13 of choices, 65 bits, and the check), shown as XXXXX-XXXXX-XXXX. The owner: as many variations as wanted; what matters is an easy way to carry a code into VR. Version 4 and 5 codes (13 characters) and older ones still read, with the roof the hull's colour.
- **Noted for the boatyard step:** carrying a code into VR. Today it's the `?design=` address; better would be an in-game keypad, or scanning it from the Shipyard page.
- **Checked:** typecheck; all 511 tests (new: version 5 codes read with the roof the hull's colour); screenshots of an orange roof on a navy pilot boat, "Like hull" on a grey landing craft, and the game's workboat, its hull now plain.

### Shipyard: the roof sits on the windows; side views bow to the right (owner)

- **The owner, with a photo of a Targa-style boat:** the roof shouldn't be two parts. The roof *is* the visor: one slab that always overhangs the windows and hides the wipers' works.
- **Windows to the roof:** the white band of wall above the windows is gone. The windows now run up to the roof's underside, with only their black frame between (`windowHead = headroom - frameWidth` in `shipyard/build.ts`). The wall pieces above the band are drawn only if there's room for them (`buildShapedHouse`).
- **Visor:** it always overhangs: 0.15 .. 0.75 m (`SCALES.visor`, was 0 .. 0.6), so any code's visor index now reaches 0.15 m further.
- **Sidelights:** they move onto the roof slab's edges, since there's no wall above the windows now.
- **Side views from starboard (owner):** a profile is always drawn with the bow to the right. The Shipyard's Side view and the hull study's side view now look from starboard. The 2D sketch mode, when it comes, should do the same.
- **Checked:** typecheck; all 511 tests; screenshots from the side (bow right), bow 3/4 and helm of a white pilot boat with a 30 cm roof and a 45 deg edge, and of a navy workboat with an orange roof.

### Test: an outside 3D model (the dirt bike) on the quay (owner)

- **The owner asked** to test importing a .glb model (a dirt bike, exported from Godot) and placing it on the pier where the game starts.
- **The file as given** was too heavy for the Quest: 10.9 MB, 120,568 triangles, 101 pieces (about 101 draw calls), 80 realistic materials with normal maps.
- **Slimmed (owner: fewer triangles, the design kept):** with the glTF Transform command-line tool, run with npx (not a dependency of the game): weld, simplify (meshoptimizer: ratio 0.1, error 0.006), quantize. That gives 19,508 triangles (-84 %) and 0.96 MB, at `public/models/mx_gold_dirt.glb`. Compared side by side with the original close up, the spokes, tyre tread, number board and frame survive; 30 % and 15 % versions were also tried.
- **Loading (`world/view/glbProp.ts`, `loadFlatProp`):** with three's GLTFLoader (part of three, no new dependency), loaded only with `?bike` in the address, in its own small code chunk. Every part is merged into one flat-shaded mesh, each in its material's base colour (textures and normal maps dropped): **one draw call**. Positions are converted to plain floats first, because quantized ones clipped when moved into place.
- **Placing it (`App.ts`):** on the Calder Haven quay top (y 1.6) at (712.8, 657.5), by the edge a few metres to the left of where you start, side-on to you.
- **Not done:** no collision (you walk through it), and it isn't in multiplayer or saves; it's a view-only test.
- **Source (owner):** a model from a friend's game, and fine to keep. The long-term idea is to connect the two games: bikes imported from it and shipped around this world as cargo. That's an agreed exception to "original designs only" for models from that game.
- **Checked:** typecheck; all tests; production build (the loader is a separate 0.8 kB chunk); in the headless browser it loads with no errors; measured with the original file in view, +1 draw call and +120,568 triangles.
- **Owner test:** open https://tartanski-cpu.github.io/SWVR/next/?bike, on the Quest or desktop, and turn left from where you start on the quay.

### Fix: flicker on the front of a Shipyard wheelhouse (owner)

- **What it was:** the black corner post between the side windows' sill (1.0 m) and the front glass's (1.31 m) stood proud of the side wall but not of the front. Its front face lay in the white front wall's plane and z-fought.
- **Fix:** it now stands `FRAME_PROUD` (4 mm) proud all round, forward and up and down too (`buildShapedHouse`).
- **Also checked:** the shaped house's other overlaps (roof and lining, console, floor, door sill). None put two colours in one plane.
- **Checked:** typecheck; all tests; a close render of the front corner.

### A placeable deck crane, a module of its own (owner)

- **The owner asked** to finish the module build-out and for a deck crane, independent of the skiff's crane, as a placeable module. The owner noted the wipers and the rain glass belong with the wheelhouse, and the hand gear is already on Shipyard designs, so the deck crane is this round's piece. My open questions went unanswered, so I used my recommendations: controls on a post at the crane; it lifts the game's cargo, hanging rigid under the hook (no swing); the load's weight acts on the boat at the hook; placeable on Shipyard designs.
- **The module (`modules/deckCrane`, `deck.crane`, fits any `deck.equipment` socket):**
  - a column that slews on a plinth, a boom that luffs on a ram, a wire to a hook;
  - drawn in its socket's axes, so it can go anywhere and face any way;
  - worked from a control post beside it: a joystick (sideways slews, push raises the boom), HOIST UP and HOIST DOWN (hold), and HOOK;
  - it moves only with deck hydraulic pressure (engine running and the DECK HYD breaker on), at its own rates;
  - designs with a crane also get the hydraulic pump on the engine's power take-off.
- **Its state is its own.** The angles it has reached, the wire out and what's on the hook live in `VesselState.modules` (new: module state kept with the boat, so crew in multiplayer see it move). It is made with the boat, so its controls work from her first moment.
- **Its bus keys** (`crane.slew`, `crane.luff`, `crane.hoistUp`, `crane.hoistDown`, `crane.hook`) exist only on a boat with a crane, so the other boats' runs are unchanged (golden runs identical).
- **Lifting cargo (`cargo/cargo.ts`, `stepCraneCargo`; `cargo/craneHook.ts`):**
  - **HOOK with an empty hook** takes the nearest free crate or drum whose top is within `hookReach` of the hook, up to the crane's safe working load;
  - **HOOK with a load** sets it down on what's under it, once it's lowered close enough:
    - her own deck (if there's room and payload);
    - the quay or shore (delivered there if it's that port's cargo);
    - the sea: lost, or a pot is shot;
  - too high, or no room: it stays on the hook;
  - a hooked item can't be picked up by hand;
  - its weight bears on the boat at the hook, so a load swung outboard heels her.
- **Placeable on Shipyard designs:** a new choice, **Deck gear: None / Foredeck / Aft deck**.
  - **Foredeck:** on the centreline, 0.9 m forward of the house, its post toward the house.
  - **Aft deck:** to port, 0.9 m aft of the house, facing aft, its post inboard.
  - **Weight:** its 420 kg is designed in, as the engine's is, so she still floats on her lines.
  - **If it doesn't fit,** it's left off with a warning.
  - **Codes:** version 7, still 14 characters; version 6 codes read as before, without a crane.
- **Config:** `CONFIG.modules.deckCrane`:
  - **size:** `plinthHeight`, `plinthRadius`, `columnHeight`, `columnRadius`, `boomLength` 3.4 m, `boomDepth`;
  - **rates:** `slewRateDeg` 25, `luffRateDeg` 12, `hoistRate` 0.35 m/s;
  - **limits:** `slewLimitDeg` 170, `luffMinDeg` -5, `luffMaxDeg` 70, `wireMin` 0.4, `wireMax` 6 m;
  - **loads:** `swlKg` 800, `massKg` 420;
  - **positions:** `stow` (its angles before the stick is touched), `post` (the control post's place), `hookReach` 0.6 m.
- **Footprints:** a module's own footprints are now turned and moved with its socket (`placeFootprint` in `simAssembly.ts`), so the walk area keeps you out of the column wherever it stands.
- **Checked:**
  - typecheck; all tests (517), including new ones:
    - it builds fore and aft on every hull, valid and level;
    - it holds without pressure and moves at its rates;
    - it hooks, carries and sets down a crate, and won't lift over its safe working load;
    - version 6 codes still read;
  - in the headless browser, in a design moored at Calder Haven: started the engine, raised the boom, hooked a crate off the foredeck, swung it to starboard (she heeled about 1°), and landed it on the quay.
- **Not done yet:** the tow winch, A-frame, net drum, windlass and tender crane are modules but drawn at the workboat's fixed places. Making them placeable is next.

### The skiff crane and the anchor windlass made placeable (owner)

- **The owner found** the skiff (with her crane) and the anchor still couldn't be placed in the Shipyard. On the module side the reason was that both were fixed to the workboat's own coordinates. Both now stand wherever their socket is, like the deck crane, tow winch and stern gear.
- **The skiff crane (`deck.tender-crane`)** fits any `deck.equipment` socket; the socket is the foot of its column.
  - **What moves with the column:** the cradle, the launch and recovery path, the control box, its LAUNCH / RECOVER button and where the crew step off (`placeTenderCrane`, `src/vessel/tenderCrane.ts`).
  - **Heights** move with the deck at the socket (`tenderCrane.deckAtColumn`: the workboat's deck height at her column, 1.21 m). She is still lowered to the water.
  - **To port of the centreline it's mirrored:** the cradle is to starboard of the column and she goes over the port side, still swung round over the bow.
  - **The SKIFF CRANE button on the helm** is where the recipe puts it (`consoleButton`), or left off (`null`) on a boat whose console has no place for it.
  - **Any boat with the crane carries the skiff**, as before.
  - **For the Shipyard:** the crane is hydraulic, so a design with it needs the PTO pump (the builder adds it today only for the deck crane and tow winch). The column wants to stand off the centreline, with the cradle's 1.8 m width clear on the side toward the centreline.
- **The anchor windlass (`deck.anchor-windlass`)** fits a `bow.windlass` or any `deck.equipment` socket; the socket is the bow roller, the hawse, where the chain leaves her.
  - **The chain** leads out along the socket's forward direction, so a socket turned to face aft makes it a stern (kedge) anchor.
  - **Its pull, the chain and the windlass sound** all work from the socket.
  - **It now draws itself:** the roller in its cheeks, and the windlass (motor housing and gypsy wheel) `aft` 0.75 m behind it on the deck, with the chain between (`CONFIG.modules.anchorWindlass`: `draw`, `roller`, `aft`, `box`, `gypsy`).
  - **The workboat's recipe turns the drawing off** (`draw: false`): her skiff in its cradle covers that part of her foredeck.
  - **For the Shipyard:** it still needs the ANCHOR switch on the console (`control.toggle` bound to `anchor.letGo`), as on the workboat.
- **On the workboat nothing changes:** both are where they were, and the golden runs are unchanged.
- **Checked:**
  - typecheck and all tests (623), including new ones:
    - at the workboat's socket the crane is exactly as before;
    - mirrored to port, every point of the path is the workboat's mirrored about the column;
    - on another socket the skiff is carried, launched and let go under it;
    - the anchor's hawse is its socket, and on an aft deck socket it lets go;
  - in the game, headless, with both fitted to the landing craft for the test only (not kept):
    - the crane to port, with the cradle and skiff to starboard of it;
    - the skiff swung over the bow and lowered on the port side;
    - a stern anchor's roller and windlass at the transom.
- **Not checked:** on a Shipyard design, because they aren't Shipyard choices yet; that's for the Shipyard chat. VR not tried.

### The pull-down whiteboard (owner)

- **The owner didn't like** the whiteboard low on the wall on designs, and asked for one you pull down from the ceiling like a projector screen, a little bigger.
- **The module (`furniture.whiteboard`)** now also fits a `cabin.overhead` socket.
  - **The roller:** it hangs in a roller box under the roof (`CONFIG.modules.whiteboard.roller`).
  - **The board:** 1.1 × 0.8 m (was 0.85 × 0.62), or as wide as there's room for.
  - **The handle:** a wooden grip on a cord below the board's bottom bar. A pull unrolls it over `rollS` (1 s); pull again and it rolls back up.
  - **Shared:** whether it's down is the boat's (`whiteboard.down`, `controls.boardDown`), so the crew see the same.
  - **Writing:** only when it's down (`BoardView` ignores pointing while it's rolled up).
  - **The key** exists only on a boat with a pull-down board (it starts rolled up), so the other boats' golden runs are unchanged.
- **On a wall** it's as before (the workboat's).
- **Designs** hang it from the roof just forward of the aft wall, port of the door, facing forward: pulled down it's at eye height in front of the aft window.
- **Checked:**
  - typecheck and all tests (598), including new ones: rolled up at first; the handle asks for it down; it unrolls in its time, from just under the roof; it rolls back up and takes no pointing; golden runs unchanged;
  - in the game, headless, on a design: rolled up (the box and its handle under the roof), then pulled down (at eye height, ready for notes). Screenshots of both.
- **Not checked:** pulling it in VR. Walking through it pulled down isn't stopped: it has no footprint.

### Chartplotter, NAV / WIND screen, task board, whiteboard and chart table on designs (owner)

- **The owner asked** for the chartplotter, whiteboard, task board, chart table and weather instrument to be modules, and shown in the Shipyard: all but the chart table in the advanced package.
- **They were all modules already:** `nav.chartplotter`, `furniture.whiteboard`, `furniture.duty-board` (the task board), `furniture.chart-table`, and the weather instrument, which is the NAV / WIND screen (`instrument.screen`, screen 'nav', hung). Only the workboat carried them.
- **Shipyard designs now carry them** (the builder places them from the house's size; the modules are unchanged):
  - **with the advanced controls:**
    - the chartplotter hung out to starboard ahead of the helm, turned toward it (the VHF's mirror);
    - the NAV / WIND screen hung on the centreline ahead of the helm;
    - the task board on the starboard wall, aft;
    - the whiteboard on the aft wall, port of the door;
    - the FM set moves aft to starboard, over the helmsman's head, to make room for the plotter.
    - The boards sit below the window sill, on solid wall (a design's walls are glass above it), 2 cm off the wall so they don't flicker against its frames.
  - **Chart table (its own choice, not in the package):**
    - "Chart table: None / Port wall, aft" in the wheelhouse step;
    - along the port wall, its aft end 0.3 m from the aft wall;
    - fitted only if you can still pass inboard of it (0.35 m) and it leaves the helm clear, else left off with a warning (the landing craft hull's narrow default house, for one);
    - design codes go to **version 9**, still 15 characters; older codes read as before, without a chart table.
- **Checked:**
  - typecheck and all tests, including new ones:
    - the advanced package's four on every hull type;
    - the chart table, or its warning, on each, with the walk past it clear;
    - version 8 codes read as before;
  - in the game, headless, in a workboat-type design with the advanced controls and the chart table: views of each in place, the plotter and NAV / WIND screen live, the task board listing the duties, the whiteboard clean, the chart table with its lamp.
- **Not checked:** using them in VR on a design.

### FM radio on the landing craft and on designs (owner)

- **The owner noticed** the FM radio hadn't made it onto the other boats, and wanted it to come with the advanced interior.
- **The module (`radio.fm`)** already existed, but it fitted only a slot in the workboat's overhead panel. Now it also fits a `cabin.overhead` socket, under a cabin roof like the VHF:
  - it hangs there in a small box of its own (`CONFIG.modules.fmRadio.housing`, `housingX`) on a strap up to the roof's underside;
  - the display faces down and the switch and TUNE hang below, as in the workboat's panel;
  - the music already found the set by its module, so it plays from wherever the set is.
- **The landing craft** has one under her roof to starboard, opposite the VHF (`places.fm`).
- **Shipyard designs** carry the landing craft's fit-out, so they get a matching socket: a small builder edit, made here because without the socket every design would break. The set comes with the **advanced** controls only, as the owner said (the page's note says so).
- **Checked:**
  - typecheck and all tests, including new ones:
    - the landing craft's set hangs to starboard under her roof with its controls;
    - basic designs have no FM set, advanced ones do;
    - golden runs unchanged;
  - in the game, headless, in the landing craft: master and radio breaker on, FM on, its display lit ("FM 88.6 TruckersFM", asking for a click to play).
- **Not checked:** listening to it in VR.

### Deck crane: stands at the deck edge (owner)

- **The owner asked** for the deck crane to always stand off to port or starboard, to leave the working deck as free as possible.
- **The module decides where it stands from its socket** (new config `side`, `craneSeat`):
  - **'auto'** (the default): from a centreline socket it moves out to the starboard deck edge; on a socket already off to one side it stays there;
  - **'port'** or **'starboard'**: that edge;
  - **'socket'**: exactly on the socket, as before.
  - At the edge its column stands `edgeInset` (0.55 m) in from the deck edge, its control post always inboard of it.
  - A socket turned across her (not square fore and aft) keeps it on the socket.
- **Everything follows the column:** its drawing, its footprint (the walk area and cargo), where its hook and load are, the motion compensation, and its weight. A crane at the edge heels her a little that way, as it should.
- **Framework:** a module's `physical` (its mass and CG) can now be given the hull and its socket's place, as `gear` and `footprints` are, for gear that stands where it chooses from its socket.
- **Effect on Shipyard designs** (no Shipyard code changed, by the owner's split between chats):
  - the foredeck crane now stands at the starboard edge; the aft deck one stays at the port edge where it was;
  - **for the Shipyard chat:** the builder still plans the foredeck crane as if on the centreline:
    - its clash checks: a starboard foredeck searchlight pole can now land on the crane;
    - its designed-in weight: she now heels slightly to starboard;
  - the place to ask is `craneSeat` / `cranesOf(...).place`.
- **Checked:**
  - typecheck and all tests (581), including new ones:
    - where it stands for a centreline socket (starboard edge), asked for port, an off-centre socket turned aft (stays, post inboard), and 'socket';
    - its weight heels her toward it;
    - the Shipyard build test now checks the column is at the side, not in the walk area;
    - golden runs unchanged;
  - Shipyard 3D views (only looked at): the foredeck crane at the starboard edge with the post inboard and the foredeck clear (plan view), and the aft deck crane at the port edge.

### Deck crane: motion compensation, an upgrade you buy (owner)

- **The owner asked** for an upgrade that makes the crane motion compensated: something you buy, not a button.
- **The upgrade:** 'craneComp', "Crane motion compensation", in the chandlery (menu, Yard tab), £3,500, reputation 15.
  - Upgrades can now say what module they need (`needs`). This one needs a `deck.crane` on the home boat; without one it shows "Needs a deck crane".
- **What it does:** while there's deck hydraulic pressure, the crane holds its hook where it would hang if she floated upright and steady, against her roll, pitch and heave, like a real active motion-compensated crane.
  - It keeps her heading, so you still slew the hook round with her, and her height averaged over `motionComp.settleS` (8 s). That takes out her heave on the waves but not a change of draught.
  - It moves the hook at most `motionComp.stroke` (1.2 m) from where the boom alone would leave it: its rams' and wire's travel.
  - Off, or with no pressure, the hook rides with her, as before.
- **How it's built:**
  - **The world works it, each tick** (`cargo/craneHook.ts` `compensatedHook`, run from `stepCraneCargo`, which now takes `dt`). It needs the boat's pose and the career.
  - **The result goes in the crane's state** (`hookAt`, `refY`; `deck.crane` v3), so crew in multiplayer see the same.
  - **Taking, setting down and the load's weight** all use the held hook.
  - **The crane draws its wire** from the boom tip to wherever the hook is (plumb in the world when compensated, at an angle to the boat).
- **Config:** `CONFIG.modules.deckCrane.motionComp` {`stroke`, `settleS`}; the upgrade in `CONFIG.career.upgrades`.
- **Checked:**
  - typecheck and all tests, including new ones:
    - in the default sea, the boom out over the side, the hook's wander over 20 s (as she heads and drifts) drops from 0.93 m to 0.12 m with it fitted, and stays large with no hydraulic pressure;
    - it's only for sale on a boat with a deck crane;
    - golden runs unchanged;
  - in the game, headless: heeled 8° with the boom out over the low side, the hook is held up and the wire hangs plumb (screenshots with it on and off).
- **Not checked:** how it feels in VR in a seaway.

### Deck crane: telescopic boom, load-moment limit, keyboard working on desktop (owner)

- **The owner tested the deck crane** and asked for:
  - a way to extend the boom, to reach out over the deck;
  - easier working for keyboard users: grab the joystick and still look around, the boom on W A S D, and keys for the wire and the boom in and out. VR players use the joystick and buttons directly.
- **Telescopic boom (`deck.crane` v2):**
  - an inner section runs out of the boom's tip up to `extendMax` (2.0 m) at `extendRate` (0.3 m/s), on new **BOOM OUT / BOOM IN** buttons (hold, blue) on the post's desk;
  - it's drawn a size smaller, so it hides inside the base section when run in, and the sheave head rides on its end;
  - the crane's state gains `extend` (saved states from v1 come in with the boom run in);
  - the bus gains `crane.boomOut` and `crane.boomIn`, on a boat with a crane only.
- **Load-moment limit (naval architect's addition):**
  - `swlKg` (800 kg) holds out to the base boom's reach (`boomLength`, 3.4 m); further out it's the same load moment, load × reach (`safeLoadAt`): about 500 kg at full stretch, level;
  - the hook won't take a load heavier than that at its reach;
  - with a load on (the world tells the crane, `loadKg`), the boom won't run out or lower past the limit, but always comes back in or up.
- **The desk** is wider (`post.deskWidth` 0.5 m, `deskDepth` 0.28 m). Standing at it, left to right:
  - BOOM OUT (far) and IN (near);
  - the joystick;
  - HOIST UP (far) and DOWN (near);
  - HOOK.
- **Keyboard on desktop.** Clicking the joystick already steered it with W A S D while the mouse looks around (the searchlight's way). Now a steered control can carry companion keys (`Control.keyExtras`) that hold its buttons down while held:
  - the crane's are **R / F** hoist up / down, **E / Q** boom out / in, **Space** hook;
  - the on-screen hint lists them;
  - while it's steered, those keys do nothing else: no engine stop on E, no lash on Q, no jump on Space, no fly mode on F (`Keyboard.claim`);
  - letting go of the joystick lets go of any held button.
- **Checked:**
  - typecheck and all tests (577), including new ones:
    - the boom runs out and in at its rate, and the hook goes further out by as much;
    - the load moment;
    - the limiter stops the boom running out with a 700 kg crate on, and lets it come back in;
    - a load over the limit at that reach isn't taken, but is once the boom's run in;
    - the companion keys press, hold and release their buttons, and let go with the joystick;
    - golden runs unchanged;
  - in the game, headless, on a design with the crane:
    - clicked the joystick, then held W (boom up), E (boom out; the engine kept running), D (slew) and F (hoist down): the crane followed each;
    - screenshots of the boom run out and of the new desk.
- **Not checked:** in VR, the BOOM buttons by hand.

### Tow winch, stern roller and trawl A-frame: placeable modules (owner)

- **The owner asked** for the trawl A-frame and the winch to be modularised next. They were modules already, but tied to the starting workboat's places. The owner also set this chat's scope: it makes, tests and tweaks modules; putting them on the Shipyard page is done in a separate chat.
- **Tow winch (`deck.tow-winch`): now drawn and worked from its socket.**
  - It goes on any `deck.equipment` socket, anywhere on deck, facing any way (the socket's rotation).
  - Its axes are the socket's: the deck at y 0, the drum across x, the wire leaving aft (+z).
  - It used to sit at the workboat's `towWinch.z` on the centreline whatever socket it was fitted to.
  - Where the wire leaves the drum (the towing system's lead) and its footprint turn and move with it.
  - Its config is its sizes only. `CONFIG.vessels.workboat.towWinch.z` is now just where the workboat's hull puts its socket.
- **Stern roller (`deck.stern-roller`) and A-frame (`deck.a-frame`): stand at their socket.**
  - They used to always find the hull's transom. They still fit themselves to the hull there: the roller at her deck height on the centreline, the A-frame's feet on her quarters at her beam and deck.
  - So they fit any hull's stern.
  - The A-frame's distances (`fishing.aFrame`: `footFromTransom`, `headAft`) are now measured from its socket. On the workboat that's still the transom.
- **Framework:** a module's `footprints` now also gets `at` (its socket's place on the boat), like `gear` does. Boat-axes gear that stands where its socket is uses it.
- **Unchanged:** the workboat (golden runs identical) and every other boat.
- **For the Shipyard chat (fitting them to designs):**
  - the winch: a `deck.equipment` socket on the deck, rotated as wanted;
  - the stern roller and the A-frame: `stern.gantry` sockets at the transom;
  - the trawl (`fishing.trawl`): any `deck.equipment` socket (nominal), with an A-frame on board;
  - the winch and the trawl need deck hydraulics (`hydraulics.pto-pump` on an `engine.bay` socket) and the DECK HYD breaker;
  - the TRAWL switch is a `control.toggle` bound to `trawl.shoot` on the console (the workboat's console has one);
  - the hull needs a notch in her transom bulwark for the roller: `layout.fairleadGap` (the workboat's is 0.44 m);
  - the A-frame needs about 1.4 m of aft deck for its braces, and the winch room to stand forward of it.
- **Checked:**
  - typecheck and all tests (566), including new `tests/modular/sternGear.test.ts`. It fits all four to the landing craft through sockets added for the test, and checks:
    - a valid boat, with the lead, tow point and A-frame where the sockets and her hull put them;
    - the winch turned on its socket turns its lead, footprint and drum;
    - the controls are on her;
    - she tows (the winch heaves the line in) and trawls (the net goes out) as the workboat does;
  - screenshots in the headless browser, the sockets patched in by the browser only: the landing craft with the A-frame, roller and winch across the deck, and with the winch turned fore-and-aft.
- **Not checked:** working them in VR on another boat (no boat in the game has them but the workboat yet).

### Searchlight and fire monitor: on the roof or on a deck pole (owner)

- **The owner asked** for the fire monitor and the searchlight to be adaptive modules: on the wheelhouse roof just as they are on the starting boat, or on the working deck on a pole so they're high, with a joystick at the pole, and possibly one in the wheelhouse too.
- **The modules (`deck.searchlight`, `deck.fire-monitor`)** now fit a `roof.mount` or a `deck.equipment` socket. They take a `pole` in their config: `null` on the roof (the starting boat and the landing craft: unchanged, golden runs identical), or the deck's height at its foot.
- **On a pole** (`mechanisms/deckPole.ts`, shared by both):
  - a steel pole from a foot plate on the deck up to the unit's own short post;
  - a control box on the pole's aft side at hand height, square to the boat, so you stand aft of it facing forward and work it like the helm's (sideways trains it, push raises it);
  - the searchlight's box has its joystick and SPOT switch;
  - the monitor's box has its joystick, FIRE PUMP switch and FIRE gauge (the gauge moves there from the console);
  - you can't walk through the pole (its footprint), but can stand at the box.
- **Both sets of controls work the same keys,** so the pole's and the helm's move the same light or monitor.
- **Shipyard designs:** two new choices under **4. Deck gear**:
  - **Searchlight:** None / Roof / Foredeck pole / Aft deck pole;
  - **Fire monitor:** None / Roof / Foredeck pole / Aft deck pole;
  - **Where the poles go:** `fromHouse` (0.75 m) forward or aft of the house, `inset` (0.3 m) in from the deck edge, the searchlight to starboard and the monitor to port;
  - **Clashes:** a pole that would clash with the crane or the other pole goes to the other side, then a step (0.85 m) further from the house; with no room left it's left off with a warning (only the aft crane with both poles aft, on the landing craft and gillnetter);
  - **Lamp heights:** the searchlight's lamp is `lampHeight` (2.5 m) above the deck, the monitor's nozzle `nozzleHeight` (2.3 m);
  - **Roof monitor:** centred on the roof aft of the masthead light (clear of its barrel's swing); its FIRE PUMP switch goes by SPOT, its joystick on the searchlight's pedestal with the FIRE gauge between them.
- **Which controls are in the wheelhouse:**
  - a unit on the roof always has its helm controls (the only place to work it), even with the basic controls;
  - a unit on a pole has its own at the pole, and the helm's as well with the advanced controls.
- **Codes:** version 8, now **15 characters**.
  - Older codes read as the same boats: the searchlight on the roof if they had the advanced controls (which carried it until now), none if basic; no monitor.
  - Designs saved in the browser (sessions, variants) follow the same rule.
  - Favourites are codes, so they read as before.
- **Price:** a design's price now counts the crane (£25,000) and the monitor with its pump (£15,000).
- **Fix:** the FIRE gauge's bar starts empty. Before a fire job set it, it showed a full-length red bar, seen in the Shipyard's preview.
- **Config:** `CONFIG.modules.deckPole`:
  - `lampHeight`, `nozzleHeight`, `boxHeight` 1.05 m;
  - `radius`;
  - `box` {width, depth, height};
  - `fromHouse`, `inset`.
- **Checked:**
  - typecheck and all tests (551), including new ones:
    - every hull × crane × searchlight × monitor builds a valid boat;
    - each pole stands on deck with its unit over 2 m up, blocks walking at its foot, and leaves room to stand at its box;
    - which helm controls appear for roof, pole, basic and advanced;
    - version 7 codes and old saved designs read as before;
  - Shipyard screenshots: poles fore and aft, roof units, the console with both joysticks and the gauge, and the aft crane with both poles;
  - in the game, in a design with the searchlight on a foredeck pole and the monitor on an aft-deck pole:
    - both poles' controls are there with the helm's;
    - the searchlight lights;
    - with the engine running and FIRE PUMP on, the jet flows from the monitor on its pole;
    - screenshots of both boxes and the jet.
- **Not checked:** working the pole joysticks with VR controllers.
- **Known:** the deck crane's boom isn't stopped by a pole, so swung low over one it passes through it (there's no collision between deck gear).

### Shipyard: favourites (owner)

- **The owner asked:** a way to save favourite designs in the Shipyard.
- **On the page** (`shipyard.html`, `src/shipyard/page.ts`), under Her code, a **Favourites** section:
  - a name box and **Save to favourites**. With no name, she's called after her hull type and length, e.g. "Pilot boat 11.0 m". Saving needs her code ready (gearbox matched); until then the page says to wait.
  - the list, newest first. Each card has a small picture of her from the bow quarter (192 x 120 JPEG, taken from the page's own 3D view, the view put back after), a line of figures (length, displacement, top speed if her trial has run, engine), her code and the date. Buttons: **Open** (loads her, like typing her code), **Try in game**, **Delete** (asks first). The design on show, if it's a favourite, is marked.
- **What's kept** (`src/shipyard/favourites.ts`): just the code, the name, the time, the picture and the summary. A favourite is exactly the boat whose code it holds, and still opens after the code format grows, since older codes read as the same boats. Saving under an existing name (any case) replaces it. At most `MAX_FAVOURITES` (40); the oldest drop off. Bad or unreadable entries are skipped, never an error.
- **Where:** the browser's storage, key `swvr.shipyard.favourites` (a new key: no existing save is touched). It's per browser and device: the Quest and the desktop keep separate lists, and a design moves between them by its code. If the storage is full the pictures are dropped and the designs kept. In a private window, where nothing can be saved, the page says so.
- **Safe for the game:** the page is separate from the 3D game. Nothing in the game reads the favourites (yet: buying at the boatyard could offer them later).
- **Tests** (`tests/shipyard/favourites.test.ts`):
  - saved and read back newest first;
  - same name replaces, delete;
  - the cap;
  - bad storage, bad JSON and bad codes read as nothing; a full store reports failure;
  - names tidied.
- **Checked in headless Chromium:** saved the default design (unnamed) and a renamed landing-craft variant, reloaded the page (both still listed), opened one (marked as the current design, its code shown), deleted one; screenshot of the list with pictures.
- **Owner test (desktop or phone, and the Quest's browser):**
  1. On the Shipyard page, make a design, type a name and press Save to favourites.
  2. Change her and save under another name.
  3. Reload the page: both are listed. Open each.
  4. Delete one.

### Shipyard: the sea trial in sight while the sliders move (owner)

- **The owner asked:** use the page's space better, so the effect on the sea trial shows while moving the sliders. It was below the bottom of the screen, under the choices, and the 3D view could be smaller.
- **Layout** (`shipyard.html`, CSS grid):
  - **Wide screens (1200 px and up):** three columns: the choices (360 px) on the left, her 3D view in the middle, and the results (360 px) on the right. The results are, in order, the sea trial, her figures and warnings, her code and the favourites. Each side scrolls on its own, so the trial stays put while you scroll the choices.
  - **761-1199 px:** the choices on the left; the view over the results on the right, at 46 % of the height.
  - **Phones:** one column, with the 3D view pinned at the top (40 % of the screen) above the choices, then the results.
- **A line of key figures on the 3D view** (`page.ts showQuick`, on every layout): GM, displacement, draught, and from the trial top speed, turning circle, crash-stop distance and roll period. While a new trial runs, the old trial's numbers (in the line and in the table) are greyed and "trial running…" shows, so it's clear which numbers are current. The trial's own run time (0.5 s wait, then the background worker) is unchanged.
- **Checked:** typecheck; all tests; screenshots at 1920 x 1080, 1366 x 768 (also mid-trial, greyed), 1024 x 768 and a 390 px phone.
- **Owner test:** open the Shipyard on the desktop and drag the Length slider: the trial column on the right greys, then fills in again a moment later. Try it on the phone too: the view and its line of figures stay at the top while you scroll the choices.

### Merged: potting milestone 3 and the quick crate and pot jobs from the dev branch (owner request)

- **What came in** (built on the dev branch; see its entries under "Fixes after V1.0"): potting milestone 3 (hook the buoy, bring it aboard, haul the line hand over hand, the catch drawn in the pot, the bait tub), the follow-up where the catch stays in the pot and is sold by setting it down on a harbour quay (career job kind `catch`, `potting.price`), and every crate and pot job by one click in the menu's Cargo tab (Load, Unload, Lash all / Release all, Lift crates, Load pots, Bait all, Shoot one, Haul nearest). Still behind Settings > Game > Potting. The crate-lift fix was on both branches already; its config entry (`rescue.liftHandReach`) came in twice and is kept once.
- **Fitted to the modular boats:**
  - **The bait tub is a stowage place on the hull**, like the extinguisher, torch and binoculars (`stowage.baitTub`, vessel x and z; it stands on the deck). The workboat's is `potting.baitBox` (unchanged, outside the wheelhouse's aft wall, port side). The landing craft and Shipyard boats have none yet, so they carry no tub; the menu's **Bait all** baits their pots.
  - The hand gear and binoculars keep the modular boat's per-hull places; the pot hands mount on the home boat beside them.
- **No save format change:** pots are still not saved between sessions (milestone 4). The new career job kind `catch` only adds ledger lines.
- **Checked:** typecheck, all 523 tests (the dev branch's new potting and quick-job tests among them; golden runs unchanged), the build. In headless Chromium on the workboat: potting on, the pots aboard, Bait all, Shoot one on a ground, soaked full, Haul nearest: the pot came back aboard with 6 crabs and 2 lobsters, no page errors; screenshots of the aft deck with the pots and of the bait tub in its place. **Not checked:** the hand-over-hand haul in VR with real controllers, and potting from the landing craft or a Shipyard boat.

### Shipyard: designing together, part 1: the shared session (owner)

- **The owner's brief:** three collaboration features, in order:
  1. a live shared design with presence;
  2. annotation pins that become tasks;
  3. variants with compare and merge.

  This is part 1. Backend: the owner chose option B, the game's own direct browser-to-browser link (PeerJS), with no server of our own and no account.
- **How a session works** (`src/shipyard/session.ts`, protocol only, tested in memory; `src/shipyard/yardLink.ts`, the PeerJS side):
  - **Starting one:** **Design together** makes a session id (6 letters and digits) and the link `shipyard.html?s=<id>`.
  - **Who keeps it:** the first browser to open the link registers the PeerJS id `swvr-yard-<id>` (apart from the game's `swvr-room-*`) and keeps the session. The others connect to it. Nobody sees roles or locks.
  - **Changes:** each change is a patch of design fields (`{ length: 9 }`), sent to the keeper, applied, and passed to everyone. The keeper's order is the order of record, so for one field the last change wins. The gearbox isn't shared: each browser matches its own by trial, which gives the same answer.
  - **Joining:** a joiner gets the session's design, which replaces their own copy.
  - **If the keeper leaves:** each member waits a random 0.3-1.8 s, then tries to join and, if nobody answers, keeps the session itself. The second browser to try finds the first and joins it. Leaving the page frees the id at once (`pagehide`). If a browser vanished without leaving, PeerJS holds the id for up to a minute, so the takeover keeps trying, a little longer each time, for about a minute and a half.
  - **A session with nobody in it:** each browser keeps its last copy (`swvr.yard.session.<id>`, saved 0.8 s after a change), so the link still opens the boat later. Copies made apart can differ; whoever keeps the session next starts from their own.
- **Presence:**
  - each person has a name (`swvr.yard.name`, kept in the browser) and a colour from the keeper (8 colours, no two alike while there's room);
  - chips list who's here;
  - your pointer on the boat (a raycast on her 3D view, sent 10 times a second) shows to the others as a dot with a name tag;
  - a slider someone is holding shows their colour and name on its row;
  - a control someone else just changed flashes in their colour.
- **Undo** (`src/shipyard/undo.ts`): your own changes only. A slider dragged through several steps within 1.2 s is one step. Undo puts your fields back and shares that like any change. Undo / Redo buttons, or Ctrl+Z and Ctrl+Shift+Z (Ctrl+Y). It works on your own too.
- **Shared code:** `PeerHostTransport` / `PeerClientTransport` (`net/transport.ts`) take an optional peer id. The game's calls are unchanged.
- **Tests** (`tests/shipyard/session.test.ts`):
  - joiners get the session's design and their own colours;
  - changes reach everyone, and the last received wins;
  - the gearbox and stray fields stay out of patches;
  - pointers and held controls are shared, and leavers drop off the list;
  - the keeper leaving tells the members;
  - session ids;
  - undo merges a drag, undoes and redoes, and a new change clears redo.
- **Checked in headless Chromium, over the real PeerJS broker:** two separate browsers. Simon started a session, and Amy opened the link and joined. Her length change showed on Simon's page. While she held the beam slider, Simon saw her colour and name on it and her pointer on the boat (screenshot). Her undo reached Simon. Simon closed his page, and Amy took over and kept the session.
- **Not yet:** pins and freehand marks (part 2), variants (part 3).
- **Owner test:**
  1. Type your name and press Design together. Copy the link to a second device, or send it to a friend; the Quest's browser works too.
  2. Change things on both. Hold a slider on one and look at the other.
  3. Close the first page: the second keeps going.
  4. Later, open the link again: the boat is there.

### Shipyard: designing together, part 2: pins and marks, the to-do list (owner)

- **The brief:** a drawing layer where anyone drops a pin with a short note, or scribbles a freehand mark. Pins and marks are stored in hull fractions, not pixels, so a note stays on the roof when the hull is stretched. A pin is a small task in a side list with its author: anyone can mark it done, and done pins fade.
- **Data** (`src/shipyard/notes.ts`):
  - **Pin:** `{ id, by, colour, t, at, text, done, doneBy? }`. **Mark:** `{ id, by, colour, t, pts }`, up to 300 points.
  - **Positions:** each point is a fraction (0..1) of her 3D view's bounding box along her beam, height and length (`toFrac` / `fromFrac`). Stretch her, raise the house or widen her, and the note moves with the boat.
  - **Limits:** at most 300 notes, 140 characters a note. Anything malformed is refused (`cleanNote`).
- **Shared** (`session.ts`): new messages `note` (put a note whole, by id; the last change wins) and `unnote` (delete). They go through the keeper like design patches. Joiners get the notes with the design, and the keeper's copy goes over with a takeover (`yardLink.ts`). The session's saved copy now holds the notes too.
- **On your own:** with no session, notes are kept in the browser under `swvr.yard.session.solo`. Leaving a session keeps that session's notes with you, on your own.
- **On the page** (`page.ts`, `shipyard.html`):
  - **Tools:** two new buttons on the 3D view, **📍 Pin** and **✏ Mark**. While one is on, the view doesn't turn, so the click or drag goes on the boat.
  - **A pin:** click on her and a small box asks for the note (Enter adds it, Esc cancels). Pins show as numbered round heads on a short stalk, in the author's colour; done ones fade to 35 %.
  - **A mark:** drag on her. The line follows her surface (raycast), in your colour.
  - **To do** (results column, under her figures): open pins first, oldest first, then done ones crossed out. Each shows its number, note and author ("done by …"), with **Done** / **Reopen** and **✕** (asks first). Click a note to swing the view to its pin; click a pin on the view to find it in the list.
  - **Marks:** a count, with **Remove my last** and **Clear all** (asks first; pins stay).
- **Not yet:**
  - linking a pin to the nearest module socket, and resolving it by dropping a module there, waits for modules on the Shipyard (stop 3; for now only the deck crane is a choice);
  - editing a pin's text after it's placed;
  - undo for notes (delete instead).
- **Tests:**
  - `tests/shipyard/notes.test.ts`: a roof pin stays on the roof when she's lengthened and the house raised; the list's order; replace by id; bad notes refused.
  - `session.test.ts`: a pin reaches everyone; done and deleted reach everyone; a late joiner gets them; bad notes refused.
- **Checked in headless Chromium over the real PeerJS broker**, two browsers:
  - Amy, in Side view, clicked the wheelhouse with 📍 Pin and typed "Searchlight here". Simon drew a mark along the hull.
  - Both saw both notes, and the pin was on Simon's To do.
  - Simon lengthened her (9 m to 10.6 m), and the pin moved along with her (z −0.45 m to +0.30 m), staying on the house.
  - Simon pressed Done, and Amy's list showed it faded and "done by Simon" (screenshots of both pages).
- **Owner test:**
  1. Open a session on two devices.
  2. On one, press 📍 Pin, click the roof and type a note. On the other, draw a mark with ✏ Mark.
  3. Change her length and house height: the notes stay put on her.
  4. Mark the pin Done on the other device.

### The FM radio comes from the set, and is quieter outside the wheelhouse (owner; on /next/ only)

- (Owner: heard the same everywhere; wanted it at the box under the roof, quieter out on the foredeck. It was put on the live game first by mistake and taken off again there (a revert commit); new changes go to `next` only.)
- **Before:** the stream played in a plain `<audio>` element: no direction, and a gentle fade with distance (full within 3 m, silent at 16 m), so the foredeck, only a few metres from the set, sounded nearly the same as the helm.
- **Now** (`audio/fmRadio.ts`, moved into the sound board as `sound.fm`; placed at the boat's FM set module, `homeView.fmSet`): the `<audio>` element is routed into the game's WebAudio graph: stream → low-pass → level → HRTF panner at the overhead set → the FM volume bus. The panner gives only the direction; the level by distance is still `fmRadio.fullRange` / `range`.
- **Through the walls:** outside the wheelhouse the level is times `fmRadio.outsideLevel` (0.45, about 7 dB down) and the tone is cut above `outsideLp` (2500 Hz) with the door open; `outsideShutLevel` (0.22) and `outsideShutLp` (700 Hz) with the doors shut. Smoothed, so stepping through the door doesn't click. Uses the same inside / doors-shut test as the wind and engine muffling.
- **Needs the station's permission:** WebAudio can only take a stream whose server allows cross-origin use. All six listed stations do (checked). If a station ever stops, its load fails once and it's played the old way for the rest of the session (plain element, level and walls by volume, no direction or tone change), so it doesn't go silent.
- **The listener now follows your head every frame**, not only during a rescue, so ships' horns are placed right too.
- **Checked** (on the `next` build, the workboat): typecheck, all 542 tests; in headless Chromium, a live station playing through the new route (signal measured after the level stage), full level at the helm, 0.085 against 0.2 with the 2500 Hz cut 2.5 m forward of the wheelhouse on the foredeck, and full again back inside; no page errors. **Not checked:** how it sounds (no speakers here), the doors-shut case in the browser, the plain fallback with a real refusing station, and the Quest browser.

### Shipyard: designing together, part 3: variants, compare, merge, promote (owner)

- **The brief:**
  - Any design can be forked into a variant: a full copy with a parent link.
  - The session lists its variants as tabs.
  - Compare mode shows two side by side in profile and plan at the same scale, with a list of what differs and the verdict bars for both.
  - A variant can be promoted to the main design, or merged field by field by ticking which values to keep.
  - Variants carry their own pins.
- **Data** (`src/shipyard/variants.ts`):
  - A **variant** is `{ id, name, parent, by, t, design, notes }`. A design's **doc** is `{ v: 2, variants }`: the main design (id `main`, never deleted) first, then up to 11 variants.
  - **Helpers:** `fork` (a full copy, parent link), `putVariant`, `dropVariant` (its children then hang from its parent), `promote`, `diffFields`, `mergePatch`, and `cleanDoc` / `cleanVariant` / `cleanDesign`. Every field is checked as a whole step in range.
  - **Promote:** the main takes the variant's design and notes, and the variant keeps the old main's, renamed "Main before …", so nothing is lost.
  - **Saved copies** from parts 1 and 2 (`{ v: 1, design, notes }`) read as a main design.
- **Shared** (`session.ts`, rewritten around one op list):
  - The ops are `set` (patch), `note` and `unnote`, each for a variant `v`, and `variant` (a fork, rename or promotion, put whole) and `unvariant`.
  - Both sides apply ops with the same code (`Side.apply`). The keeper's order is the order of record; the last write wins per field or per whole variant.
  - Presence adds which tab each person is on. Pointers and held sliders show only to people on the same tab.
  - The old single-design calls (`edit(patch)`, `note(n)`, `design`, `notes`) mean the main design, so parts 1-2's tests run unchanged.
- **Working alone goes through the same code:** without a session, the page keeps its variants in a keeper with nobody connected (`solo`, on the in-memory transport). It's saved under `swvr.yard.session.solo`, and starting or leaving a session carries everything across.
- **On the page** (`page.ts`, `shipyard.html`):
  - **Tabs** over the 3D view: one per variant, with coloured dots for who's on it. Double-click to rename, × to delete (asks first). **+ Fork** names and makes a copy of the tab you're on and switches to it. **Compare** appears once there are two.
  - **Undo** is per tab (switching clears it).
  - **Opened with a code** (`#CODE`, alone): it shows the variant that is that design, or else becomes the main design.
- **Compare** (a panel over the page):
  - Pick any two. Each boat's profile (from starboard, bow right) and plan are drawn by a second, small renderer (made only when Compare is first opened). Both are at one scale chosen to fit the longer, taller and beamier of the two, and their transoms line up, so a longer hull reaches further right.
  - **What differs:** each differing field with both values in the sliders' own wording (Length 9.00 m → 10.13 m, Engines Single → Twin), each with a "take" tick. **Copy ticked values** merges them into the first (onto your undo if it's your tab, shared either way). **Make it the main design** promotes the second.
  - **How they compare:** bars for both, each to the larger of the two. Top speed, turning circle, crash stop and range flat out come from each one's own sea trial, run in the background (gearbox matched); GM, displacement and price from her figures. A short hint says which way is better.
- **Fix found while testing:** the frame for pins and marks was the whole 3D view's extent, and the lights' glows and the searchlight's beam made that tens of metres too big. It's now the hull and house mesh's extent (`hullBox`), as meant. Pins placed earlier today (part 2) may sit a little off.
- **Tests** (`tests/shipyard/variants.test.ts`):
  - a fork copies the design and notes with a parent link;
  - diff ignores the gearbox; merge and promote;
  - the main design is never deleted, children re-parent, and the cap holds;
  - old copies read, and bad docs are refused;
  - in a session, a fork, its edits and its pins reach everyone, edits to one variant leave the others, a latecomer gets the lot, deleting reaches everyone, and tab presence is checked.
- **Checked in headless Chromium over the real PeerJS broker:**
  - Amy forked "Amy's twin-engine version" and made it twin-engined and longer; Simon saw the tab appear while his main stayed 9 m.
  - Simon opened Compare: the list showed Length and Engines, the trials filled in (32.4 kn against 19.5), and the profiles and plans were lined up at one scale (screenshot).
  - He ticked Engines and copied it into Main: main went twin-engined, still 9 m, and Amy's copy showed the same.
  - With the frame fixed, a pin on the house moves in proportion when she's lengthened.
- **Owner test:**
  1. In a session, press + Fork and name it. Change her on that tab.
  2. Switch tabs on the other device.
  3. Press Compare, tick a value or two and copy them across.
  4. Try Make it the main design, then find the old main kept as a variant.

### Shipyard: a designer's workflow, the brief, sketch to boat, flat sketches (owner)

- **The owner asked:**
  - The marks were overcomplicated, drawn in 3D on the model, so a line drawn in plan view showed up odd from other angles. Draw on a flat picture instead, like a screenshot.
  - A design pass over the whole Shipyard: it was a sandbox; make it a tool for designers with a workflow. Start from what kind of boat you want, or from a sketch, and have it suggest a boat. "Maximum effort."
- **The workflow** (`shipyard.html`, `page.ts`). The page is now three parts under a header:
  - **The header:** her name (shared), the **steps** (Brief, Hull, Wheelhouse, Engine, Deck gear, Controls, Paint, Trials & handover), undo / redo, who's here, and **👥 Design together** (a pop-over: your name, start a session, the link, leave).
  - **The left panel** shows only the step you're on, each with a line of guidance (`STEP_GUIDE`), and **Back / Next** at its foot. The choices' steps are made from the existing groups (`section()` now starts a step), so new choices land in a step by themselves. The step you're on is remembered for the browser tab.
  - **The middle:** her 3D view, the variants' tabs, the views, the tools (📍 Pin, ✏ Sketch) and her key figures.
  - **The right:** **the brief** checked line by line, her sea trial, her figures and warnings, **to do** (pins) and **sketches**.
  - Narrower screens put the right column under the view. On a phone it's one column with the view pinned at the top, and the steps wrap onto their own line.
- **The brief** (`src/shipyard/brief.ts`):
  - **The jobs** (`MISSIONS`): harbour workboat, landing craft, inshore fishing, pilot / crew transfer, or something else. Each has a line on what she's for, usual **targets** (top speed ≥, range flat out ≥, price ≤, GM ≥, a crane wanted) and a suggested hull type with its layout and deck gear.
  - **The targets** were set from trials of each type's engine fits (measured Oct 2026 in the browser), so a suggested boat meets its own brief with a little in hand:

    | Job | Speed | Range | Price | Best fit |
    |---|---|---|---|---|
    | Workboat (with crane) | ≥ 10 kn | ≥ 50 nm | ≤ £200k | 280 kW single: 10.0 kn |
    | Landing craft | ≥ 18 kn | ≥ 90 nm | ≤ £120k | 280 kW: 19.5 kn, £101k |
    | Fishing | ≥ 15 kn | ≥ 70 nm | ≤ £140k | twin 150 kW: 15.6 kn, £130k |
    | Pilot | ≥ 22 kn | ≥ 110 nm | ≤ £280k | twin 400 kW: 24.1 kn, 126 nm, £264k |

    The game's GM figures for these types are 0.9-2.5 m, so the GM targets (0.5-0.6 m) are a floor.
  - **Shared:** the brief is one for the design and all its variants (the client's requirement; variants are ways of meeting it). It's carried in the session (op `brief`; `YardDoc.brief`) and in saved copies.
  - **Suggest a boat for this brief:** the job's hull type and layout, then every engine fit (`engineOptions`: three engines, single and twin) is tried on her in the background trial worker. `pickEngine` fits the cheapest that meets speed, range and budget; failing that, the cheapest meeting speed and range; failing that, the fastest. Progress shows ("Trying her engines on trial: 3 of 6…") and the result says what was fitted and why. If she's changed meanwhile, it says so rather than overwrite.
  - **The check** (`checkBrief`): each line met ✓, not met ✗ (with a hint and a "Go to <step>" button), or … while her trial runs. The step bar marks Trials & handover ✓ or ✗; the last step opens with the verdict.
- **Start from a sketch** (`src/shipyard/sketchFit.ts`):
  - A squared sheet (20 x 8 m, 1 m squares, bolder every 5 m, the waterline marked, "bow →"). Two pens: **hull** (blue) and **house** (orange).
  - **Suggest a boat** reads the drawing as a naval architect reads a first sketch (`readSketch`):
    - length overall;
    - freeboard (the sheer amidships);
    - draught (the lowest line);
    - stem rake: from the forward-most point near the sheer down to the forward-most point near the keel, from the vertical;
    - a ramp bow: a long run (over a fifth of her length) at over 55°;
    - the house: its length, its place along her, its height over the sheer, and its front's lean.
  - **Matching to a type** (`fitSketch`): each hull type's own profile is read **the same way**, off its stations' sheer and keel at standard size (`hullProfiles` in page.ts), so sketch and type compare like for like. The nearest type is scored on shape: depth/length, the stem, the draught's share of the depth, the ramp, and a little on size. The sliders are then set to the drawing: length and depth scale, stem rake, house length, place, headroom, window rake.
  - It says what it read and picked, and the next nearest type. **Use this boat** applies it (shared, undoable) and goes to the Hull step. The sketch stays in the design's sketches.
- **Flat sketches replace the 3D marks** (`notes.ts` kinds `sheet` and `ink`; `src/shipyard/sheetEditor.ts`):
  - **✏ Sketch** takes a snapshot of the 3D view as it is (720 px JPEG) and opens it in the sheet editor. Draw with your pen in your colour; **Undo my last stroke**, **Clear mine**, **Done**.
  - Each stroke is its own note in the sheet's 0..1 coordinates, so several people can draw on one sheet at once and see each other's strokes as they land.
  - Sketches are listed on the right (thumbnail, author, strokes); click to open, ✕ to delete (with their strokes). At most `MAX_SHEETS` (12) a tab.
  - The old 3D marks are no longer read: any saved ones are dropped.
- **Fix found while testing: big messages broke a session.** A data channel between browsers cuts messages off at about 16 KB between some browsers (PeerJS's own piece size is 16 300 bytes). So a sketch's snapshot (about 30 KB), or the welcome to someone joining a session with sketches in it, closed the link. The session's link now sends anything over 15 000 characters in numbered pieces and joins them on arrival (`src/shipyard/chunked.ts`, wrapping the game's transports without changing them).
- **Tests:**
  - `tests/shipyard/sketchFit.test.ts`:
    - drawn profiles read right;
    - a deep near-plumb 12 m hull is a workboat, a long low ramp a landing craft, a fast raked 14 m one a pilot boat, a short beamy shallow one a gillnetter;
    - the sliders are sized to the sketch, and the house is read;
    - too little drawn gives no reading;
    - the brief: a job's targets and suggestion; picking the engine fit; each line's check.
  - `session.test.ts`: big messages in pieces, any order; a session over chunked links carries a 150 KB sketch both ways, and a late joiner gets it.
- **Checked in headless Chromium:**
  - **The walk-through** (screenshots at 1600 px and a 390 px phone):
    - Pilot / crew transfer, named "Calder pilot", then Suggest: twin 400 kW fitted after six trials, meeting every line (24.1 kn, 126 nm, £264,000).
    - The Hull step, and a snapshot sketch drawn on.
    - Start from a sketch: a 14 m hull with a raked stem and a 4.5 m house, read as a pilot boat at 100 % ("next nearest: gillnetter"). Use this boat took it to the Hull step.
    - Trials & handover with the verdict and her code.
  - **Two browsers over the real PeerJS broker:**
    - Simon set the brief (landing craft, "Island ferry") and Amy got it on joining.
    - Amy sketched on a snapshot, which reached Simon; his stroke on it reached her (screenshot of both colours).
    - Earlier checks rerun: the shared session with takeover, and variants with compare and merge.
- **Not yet:**
  - the sketch reads a profile only (beam stays the type's: a plan-view sketch could set it);
  - suggestion from the brief doesn't size the hull (it fits the engine);
  - pins don't link to module sockets (stop 3).

### Shipyard: jobs in the brief, deck cargo, sea-trial charts, pins that place equipment (owner)

- **The owner asked:**
  - The brief should match the game's jobs: lobster, fishing, cargo, fire missions.
  - The number of cargo units her deck takes is missing: "modularize that as soon as possible".
  - Graphs in the sea trial, keeping the basic numbers.
  - The sketch-to-boat "always seemed to suggest the gill netter". Then, on reflection: the pure 2D squared-paper sketch doesn't add anything, so take it out. Sketching should be free-form, shared, for discussion; **pins** are the precise part: put one on her and pick from a drop-down the equipment wanted there, and it's placed automatically in the next step.
  - Later: water jets and electric engines; more modules.
- **Deck cargo** (`src/cargo/deck.ts` `deckCapacity`; `src/shipyard/deckRoom.ts`):
  - How many items of a footprint stand on her open deck at once, one deep, by the game's own placing rule (`onOpenDeck`: inside the bulwarks, clear of the wheelhouse, the narrow bow and her deck gear): rows across the deck from the transom forward, each as many as fit side by side with a 5 cm gap, tried at four starting points and the best kept.
  - `deckRoom()` gives a design's crates (room on deck, capped by her payload `cargo.maxPayloadKg` at the crate's 40 kg), the room alone, and pots (`CONFIG.cargo.kinds` sizes).
  - Shown in her figures ("Deck cargo: 51 crates (6.3 t payload)", "Pots on deck"), the strip under the 3D view ("Deck 51 crates"), and Compare.
  - Typical at standard size: landing craft 21 crates / 10 pots, gillnetter 34 / 18, workboat 54 / 31, pilot boat 49 / 29. The game's own workboat: 37 crates.
  - `deck.ts` now keeps its hull plans by the vessel def itself (a WeakMap), so each Shipyard design (a new 'design' def each time) gets its own; no change for the game's boats.
- **Jobs in the brief** (`brief.ts` `JOBS`, `FITTABLE`, `TOW_BOLLARD_T`): tick the game's jobs she's wanted for, each adding its own lines to the check, in the game's own terms (the gear the job's code asks the boat for with `gearOf`):

  | Job | Lines |
  |---|---|
  | Cargo runs | crates on deck ≥ `crates` (default 6, the biggest cargo job) |
  | Lobster & crab pots | pots on deck ≥ `pots` (default 5, the pallet's) |
  | Towing | bollard pull ≥ 3 t (the game's workboat pulls 3.9 t); a tow point |
  | Fire fighting | a fire monitor |
  | Search & rescue | a life ring, a boat hook, a searchlight |
  | Trawling | the trawl gantry and net |

  - Gear the Shipyard can't fit yet (tow point, life ring, boat hook, trawl gear) shows as "not in the Shipyard yet" (–) and doesn't count against her; when its module comes, the line checks for real (it already asks the built boat).
  - The missions now carry jobs: workboat cargo + towing, landing craft cargo, inshore fishing pots, pilot rescue. **Suggest** fits the gear her jobs need where it can (fire monitor, searchlight, on the roof), and picks an engine that also meets the bollard pull when towing.
  - **Retuned:** the workboat's budget is now ≤ £230k (was £200k): towing needs the 400 kW engine for 3 t of bollard pull; she comes to £217k with her crane.
  - Older briefs (no jobs) read as before, with no jobs.
- **Sea-trial charts** (`src/shipyard/trialCharts.ts`; plain SVG, no library), above the numbers in the right-hand column, greyed while a new trial runs:
  - speed by lever and range by lever (25-100 %), with the brief's target as a dashed line;
  - the turning circle: her track hard over drawn through the measured advance and transfer (at 90°) and tactical diameter (at 180°), with dimension lines and her length to scale (a schematic of the measured figures, not a recorded track);
  - roll decay from 10°: the measured peaks, and the damped swing fitted to her period and damping ratio;
  - stopping: crash stop and coast to 1 kn, in metres and boat lengths.
  - One series a chart (so no legend; the title says what it is), one data colour, hairline grids, a hover tooltip on each dot and bar.
- **Pins that place equipment** (`src/shipyard/pinGear.ts`; `notes.ts` Pin `gear`, `placed`):
  - The pin editor has a drop-down: "Just a note", then the gear the Shipyard places (fire monitor, searchlight, deck crane), then gear still to come (tow winch, tow post / stern roller, trawl A-frame, pot hauler, life ring, door).
  - **At the Deck gear step** each pinned piece the Shipyard can fit is placed nearest its pin (`placeGear`): on the wheelhouse roof if the pin is on or just over it, else the foredeck or aft deck, whichever side of the house the pin is (the crane can't go on the roof: the nearer deck). The pin is then ticked done "by the Shipyard", noting where it went, and isn't placed again (move the gear by hand afterwards and it stays). A pin added while you're on Deck gear is placed at once.
  - The step lists what the pins asked for and what became of it; pinned gear not yet in the Shipyard stays on the to-do list.
  - The poles' side is fixed by the build (searchlight to starboard, monitor to port), so a pin's side doesn't move them across; the list says so.
- **Taken out: sketch to boat.** The squared profile sheet, its pens, Suggest a boat, and `sketchFit.ts` with its tests (`hullProfiles` in page.ts too). Old squared sheets are dropped when read. Before it went, the matching was improved (a type that can't be made that long ruled out; the house's place weighed), but the owner found the route itself added nothing. Snapshot sketches stay, for discussion.
- **Tests:** `tests/shipyard/deckRoom.test.ts` (the game workboat's deck; bigger hull more room; longer house less; payload cap); `brief.test.ts` (moved from sketchFit.test.ts, plus each job's lines, gear fitted by Suggest, a towing engine, older briefs); `pinGear.test.ts` (roof, foredeck, aft deck; the crane to the nearer deck; gear not yet fittable); `notes.test.ts` (a pin's gear kept; old squared sheets dropped). All 567 tests pass, with typecheck and the build.
- **Checked in headless Chromium** (1600 px): Harbour workboat, Suggest: workboat with crane, 400 kW, 13.2 kn, 64 nm, £217k, 51 crates, 4.0 t bollard pull, meets the brief, tow point "not in the Shipyard yet". The five charts drawn and a tooltip shown on hover. A pin put through the editor (tow winch) and two by script (fire monitor on the foredeck, searchlight on the aft deck): at Deck gear the monitor went to the foredeck pole and the searchlight to the aft deck pole, both pins ticked done, the tow winch left as a to-do. No page errors. **Not checked:** the Quest, a phone, two browsers placing from the same pins at once (both would make the same change, so it's harmless).
- **Next, noted:** water-jet and electric propulsion; the deck modules still to come (tow point, rescue gear, trawl gear, pot hauler, doors), which the jobs' lines and the pin list are ready for.

### Shipyard: jobs first, hull types ranked against them; a bare hull, equipment pinned on her (owner)

- **The owner asked:**
  - The harbour workboat / landing craft / inshore fishing cards on the brief are really a result of the jobs: pick cargo, towing and fire fighting, and then you could have one of the hull types. Make the type a second step.
  - Pinning and the steps along the top clashed: "you start with a raw hull and you pin things and then it places the equipment for you."
  - Sketches: found where they're kept; fine.
- **The brief is jobs and targets only** (`brief.ts`): the missions (`MISSIONS`, `missionOf`, `Brief.mission`) are gone. `Brief.hull` is the type she was started from (null before one's picked); an older brief's mission is read as its type. `newBrief()` is empty: no jobs, no targets, GM ≥ 0.5 m.
- **Hull types for this brief** (`src/shipyard/typeFit.ts`, `TYPE_FACTS`, `rankTypes`): each type checked against the brief with what it can do, **measured**: each type at standard size, bare, every engine fit, gearbox matched, the game's own sea trials (Oct 2026):

  | Type | Fit | Top kn | Range nm | Pull t | Price |
  |---|---|---|---|---|---|
  | Landing craft (21 crates, 10 pots) | 150 / twin 150 / 280 / twin 280 / 400 / twin 400 | 10.5 / 22.8 / 19.5 / 33.5 / 26.6 / 34.2 | 60 / 116 / 94 / 159 / 130 / 225 | 1.3 / 1.2 / 2.0 / 1.6 / 2.4 / 2.4 | £86-164k |
  | Gillnetter (34, 18) | same order | 8.4 / 15.6 / 11.9 / 26.2 / 18.8 / 33.6 | 55 / 75 / 52 / 118 / 85 / 153 | 1.6 / 1.4 / 2.4 / 1.9 / 2.9 / 2.2 | £124-202k |
  | Workboat (54, 31) | same order | 8.4 / 10.9 / 10.0 / 19.6 / 13.2 / 25.8 | 52 / 52 / 52 / 91 / 64 / 130 | 1.6 / 1.5 / 2.9 / 2.6 / 4.0 / 3.3 | £162-240k |
  | Pilot boat (49, 29) | same order | 8.6 / 10.8 / 10.6 / 17.8 / 12.2 / 24.1 | 56 / 53 / 46 / 84 / 61 / 126 | 1.6 / 1.5 / 2.7 / 2.6 / 4.0 / 3.3 | £186-264k |

  - A type passes speed, range, price and (for towing) bollard pull only if **one** engine fit meets them together, so no impossible boat is promised. Deck room: crates (cargo runs) and pots (potting).
  - Ranked by lines it can't meet, then by how many of the brief's jobs it's built for (`goodFor`: landing craft cargo; gillnetter pots; workboat cargo, towing, fire, trawl; pilot boat rescue), then price.
  - Each type's card: what she's built for, ✓/✗ per line with her figure, **Start from this hull**.
  - Worth knowing from the table: on these trials the landing craft is the fastest and cheapest hull, and a twin installation pulls *less* than one big engine (two smaller propellers slip more); the bollard-pull hint now says so. Re-measure the table if the hulls or engines change.
- **A bare hull** (`bareHull`): starting from a type gives her its layout with no deck gear (crane, searchlight, fire monitor off), then every engine fit is tried on her by trial and the cheapest that does the brief fitted (as before). The brief's lines then say what her jobs still need ("Fire fighting: fire monitor – none: pin one on her where you want it").
- **Steps:** Brief, Hull, Wheelhouse, **Deck gear, Engine**, Controls, Paint, Trials & handover (Deck gear before Engine: the gear's weight is in her before the engine is chosen).
- **Equipment by pin, placed at once** (`page.ts`):
  - Deck gear opens with a **palette**, a button for each piece (`pinGear.ts` EQUIPMENT; gear not in the Shipyard yet dashed): pick one, click on her, and it's pinned and **placed straight away** at the nearest of its places (roof, foredeck, aft deck: the Shipyard's set mounts, so it stands at the mount, not exactly under the pin). The 📍 Pin tool's list does the same from any step.
  - Pinned again elsewhere, a piece moves; the earlier pin is marked "moved to a later pin".
  - **Delete a pin and its equipment comes off** (if it still stands where that pin put it), with the confirm saying so.
  - Below, "Or set by hand": the old choices, still there.
  - Coming to Deck gear also places anything pinned earlier and not yet placed (older saves).
- **Tests:** `brief.test.ts` rewritten (an empty brief; a bare hull; engine choice incl. towing; the line checks; older briefs' missions read as types) with the ranking: cargo + towing + fire at harbour speed is the workboat (the only one pulling 3 t); pots the gillnetter; fast cheap cargo the landing craft; fast rescue the pilot boat; one engine fit must meet speed and price together.
- **Checked in headless Chromium** (1600 px): cargo + towing + fire, 10 kn, 50 nm, £230k: the workboat ranked first ("Best fit", 13 kn, 64 nm, £192k, 4.0 t, 54 crates), Start from this hull: a bare workboat, 400 kW fitted after six trials. Deck gear: Fire monitor from the palette, clicked on her in plan view: placed on the wheelhouse roof, pin ticked, the brief then met on every line (tow point "not in the Shipyard yet"). Deleting the pin took the monitor off. No page errors. **Not checked:** the Quest, a phone, two browsers pinning the same piece at once.

### Shipyard: a hull sized for the brief's deck cargo (owner)

- **The owner asked:** with 30 crates in the brief, starting from a type should size her deck for it; instead she came at standard size, "deck cargo 21".
- **`sizeForDeck`** (`src/shipyard/deckRoom.ts`): her length and beam grown together a slider step at a time from where they are (her proportions kept), each size built and measured (`deckRoom`, about 10 ms), until the crates and pots in the brief fit, or she's as big as the type goes (then it says she's still short). Never made smaller.
- **Start from this hull** sizes her before her engine trials, so the engine is found for the boat she'll be ("stretched to 10.1 x 3.1 m for 31 crates on deck"). The Hull step has **Size her for the brief's deck cargo** to do it again; the brief's "crates/pots on deck" line now points there.
- **The type cards** count deck room as met if the type can be stretched to it: "30 crates, stretched", or "35 crates at most" (✗). Measured at her largest (length and beam sliders full), bare: landing craft 35 crates / 23 pots, gillnetter 59 / 34, workboat 83 / 49, pilot boat 80 / 49 (`TYPE_FACTS.maxCrates`, `maxPots`). Her speed, range and price on the card are still at standard size; the stretched boat's own trial has the last word.
- **Tests:** `deckRoom.test.ts` (30 crates on a landing craft: met, stretched, proportions kept; already enough: unchanged; 200: as big as she goes, not met), `brief.test.ts` (cards: stretched, standard, at most).
- **Checked in headless Chromium:** Cargo runs, 30 crates: the landing craft first ("30 crates, stretched"); Start from this hull: stretched to 10.13 x 3.15 m, 31 crates, then 150 kW fitted; the brief met on every line. No page errors. **Not checked:** the Quest, a phone.

### Pixel painting, step 2: cargo, harbours and sea marks (owner)

- **The owner:** the painting works well in the cabin; add it, selectively, to other things in the game: the cargo crates first, maybe the houses, some buoys and nav marks.
- **Ten new images** (`render/pixelPaint.ts`, 64 x 64, made in code like the first four, each mid-grey on average so it adds detail without changing a colour):
  - `crate`: a whole crate side, one to a face: frame boards, planks, a diagonal brace, nail heads;
  - `sacking`: a coarse weave;
  - `worn`: mottled paint, scuffs, rust spots with runs below them;
  - `boards`: lapped weatherboarding with staggered joints;
  - `render`: rough render;
  - `sheet`: corrugated sheet, with laps;
  - `slates`: staggered courses of slates;
  - `concrete`: 2 m slabs with their joints, stains;
  - `stone`: rock armour;
  - `window`: a whole window, one to a face: frame, glazing bars, four panes, a glint.
- **Where they're used:**
  - **cargo:** crates (port-coloured as before; the two pale bands are gone, the painted frame does their job), sacks (now their own instanced mesh), oil drums and gas bottles (worn); the floating rescue crates are boarded too;
  - **buildings:** each has a `cladding` in `archipelago.ts` BUILDINGS: render (the harbour office and others), weatherboard (three cottages), or corrugated sheet (the two sheds, roof too). Other roofs are slated. Doors are planked, and the window is painted;
  - **harbours:** quays in concrete slabs, pier decks in planks laid across, bollards, lamp posts and fuel pumps worn;
  - **sea marks:** the buoys' floats and columns (cardinals, isolated danger, port and starboard), the light posts and the lighthouse's red band worn; the lighthouse tower rendered; the reef's rock in stone; the wreck rusted.
- **Two helpers** (`render/geometryUtils.ts`): `paintLocal` sets a part's pixels in its own frame before it's turned into place, so a house at 45 degrees still gets level boards (with `swap` for roofs: slates and corrugations run down the slope); `fitPaint` stretches a whole picture (crate side, window) onto each face once.
- **Config:** `pixelPaint.tileMetres` has a size for each new image (sacking 2, worn 1.5, boards / render / sheet / slates 2, concrete 4, stone 3; crate and window stay 1, as they're fitted). `pixelPaint.strength` still turns all of it down or off.
- **Cost** (headless browser): one draw call more (the sacks, drawn only while a sack is in the world: 27 to 28 at the start view, 125 to 126 over Calder harbour) and about 200 triangles fewer (the crate bands). One texture read per pixel on painted surfaces, as before; the texture grows to about 0.2 MB.
- **Checked:** typecheck; all tests (new: a fitted picture fills each face once; paint set in a part's own frame stays square to it once turned, and a roof's turns a quarter); screenshots of crates, a sack and drums on the Calder quay, the harbour office, the fish shed, a weatherboarded cottage, the Brannock pier, a north cardinal buoy, the lighthouse, the reef and the wreck. No page errors. **Not checked:** the Quest (shimmer at a distance, frame rate in the harbour).

### Shipyard: the builder plans the deck crane at the deck edge (owner)

- **The owner asked:** the crane module now stands at the deck edge (see "Deck crane: stands at the deck edge"); integrate it into the Shipyard, following that entry's note: the builder still planned the foredeck crane on the centreline, so its clash checks and its designed-in weight were wrong.
- **The fix** (`build.ts`): the crane's socket is put where its column stands, `edgeInset` (0.55 m) in from the deck edge: the foredeck crane at the starboard edge, the aft deck one at the port edge (was 0.6 m in; now the module's own inset). On a socket already off to one side the module's 'auto' keeps it there, so the builder and the module agree on where it is.
  - **Clash checks:** its plinth and its control post (inboard of it) are kept clear, so a pole now goes elsewhere. Before, a foredeck searchlight pole stood 0.29 m from the crane's column on every hull, inside its plinth; now the foredeck poles go to port.
  - **Weight:** designed in where it stands. The builder's weight sum (`lightshipOf`) already takes the crane's weight and moment out of the hull's, so her hull and ballast are trimmed against it (their centre of gravity a little to port) and **she floats upright**: no list from the crane, as a real design would be ballasted.
  - The aft crane's control-post flip in the recipe is gone: the module puts the post inboard by itself.
- **Not done (a question for the owner):** choosing the crane's side (port or starboard), for instance from a pin's side, needs a new design choice, and so a new code version. The foredeck crane is always starboard and the aft deck one port for now.
- **Tests:** `tests/shipyard/build.test.ts` (on every hull, crane fore or aft with both poles on the same deck: the socket is the column's place, the poles are over 0.5 m from it, no list); `tests/deckCrane.test.ts` changed: the crane's weight at the starboard edge, the hull trimmed against it, the boat upright (it used to expect a slight list).
- **Checked:** typecheck, all tests; a plan-view screenshot of a workboat with the crane and both poles on the foredeck (crane at the starboard edge with its post inboard, both poles to port).

### Dolphins keep up only to 9 kn; a trolling valve for the big engines (owner)

- **Dolphins** (owner: they shouldn't be at the bow when she's going faster than they swim, say 9 kn): `wildlife.dolphins.maxSpeed` (4.6 m/s, 9 kn). Above it no pod comes, and a pod already at the bow drops back astern over `fallBack` (5 s) and is gone; if she slows while the visit lasts, it comes up again from astern. (`wildlifeView.ts`, a per-frame "fallen back" amount that adds to the pod's distance astern.) Real dolphins can bow-ride faster than this for a while; the number is a setting.
- **Trolling valve** (owner: clicking a powerful boat into forward is "a bit tasty", too fast at 600 rpm to handle):
  - **Measured first**, steady speed with the lever just into forward (engine at idle): workboat 5.4 kn, landing craft 6.2 kn, Shipyard boats with one 400 kW V8 5.5 to 6.8 kn, with twin V8s 7.5 to 7.9 kn.
  - **The fix is in the engine module** (`propulsion.ts leverDemand` and `engineStep`), as on real boats with big engines: over the first part of the lever's travel the engine stays at idle and the gearbox clutch slips, so the propeller turns from `trollingMinShaft` (0.3) of its locked-up speed at the detent to all of it at `trollingLever` (0.3 of the lever's travel). Past that the clutch locks and the throttle opens over the rest. The clutch passes the propeller's torque; the difference in speed is lost as heat. Works ahead and astern.
  - **Who has one:** the landing craft (`landingCraft.json`), and so every Shipyard boat (built from her recipe). Not the workboat (`trollingLever: 0`, her lever as before); she can have one if the owner wants.
  - **Now** (lever 0.1 / 0.2 / 0.3 / 1): landing craft 2.4 / 4.5 / 6.1 / 20.0 kn; Shipyard pilot boat with twin 400 kW V8s 3.1 / 5.6 / 7.4 / 24.1 kn. Top speeds unchanged; the engine stays at idle through the slip.
- **Tests** (`trollingAndDolphins.test.ts`): the lever map (slip, then throttle; the workboat unchanged); the landing craft under 3.5 kn just into gear with the engine at idle, over 5.5 kn at the lock-up, over 19 kn flat out; a pod at the bow at 7.8 kn, gone after falling back at 11 kn, back once she slows. All tests pass, golden runs unchanged.
- **Not checked:** the feel on the Quest's lever.

### Towed boats float on fewer stations (owner: save CPU)

- **The owner:** the things you tow seemed to have as many buoyancy stations as the boats you drive; nobody watches a tow that closely, so cut them down.
- **Before:** the derelict, the log raft and the barge each floated on all 11 of their drawn stations (the workboat has 17), each sampling the sea three times a tick: 33 samples. (The salvage logs off the beaches were already cheap: a point on the water, no stations.)
- **Now:** a hull can float on fewer stations than it's drawn with: `hull.physicsStations` (`vessel/hullForm.ts`, `physicsStations()`); buoyancy, heave and pitch damping (`vesselPhysics.ts`), the hydrostatics and the debug view's buoyancy display use those; the drawn hull, deck heights and everything else keep all of them.
  - **derelict 6** (her fine bow needs one more: with 5 her centre of buoyancy moved 0.2 m), **log raft 5**, **barge 5**: 15 to 18 sea samples instead of 33.
  - **Masses and LCBs** set to what the physics stations integrate at the DWL, so they float level: derelict 2800 kg / 1.29 m, log raft 6490 / 1.02, barge 10540 / 1.43 (were 2750 / 1.29, 6400 / 1.0, 10500 / 1.39). GM within 0.06 m of the 11-station figure.
- **Cost:** one physics step per towed boat, in a sea, measured here: derelict 70 to 39 microseconds, log raft 63 to 29, barge 65 to 30 (the workboat 111, unchanged). Roughly half, more in absolute terms on the Quest.
- **Golden runs:** the barge tow re-recorded (the tug's speed after 10 s 4.452 to 4.469 kn, everything else by similar fractions); the others unchanged.
- **Checked:** typecheck, all tests (each towed boat still floats at its DWL, level, stable). **Not checked:** how they look riding a sea on the Quest (they should look the same).

### Shipyard: the working deck gear, placed where the pin is on a 25 cm grid (owner)

- **The owner asked:**
  - Make the tow winch, tow post / stern roller, trawl A-frame, pot hauler, life ring and side door placeable. Then: no pot hauler, potting stays a hand job.
  - A pin should place the equipment exactly where it's clicked, not at one of a few set spots. We talked over the cost (a position per piece makes the code longer, and every spot has to be checked); the owner chose a snapped grid at 25 cm.
- **Design codes, version 10** (`design.ts`):
  - New choices: `towWinch` (none / aft deck), `sternRoller` (none / in the transom), `aFrame` (none / over the transom, with the net), `lifeRing` (none / port / starboard, with the boat hook), `sideDoor` (none / port wall). 16 characters of choices and the check: 17 characters (`XXXXX-XXXXX-XXXXX-XX`).
  - **Gear placed by hand** (`PLACE_FIELDS`: `craneAt`, `lampAt`, `monitorAt`, `winchAt`): 0 for its usual place, else its cell on `PLACE_GRID` (25 cm squares measured from the transom forward and the centreline out: 25 across x 72 along, up to 3 m off the centreline and 17.75 m from the transom) and, for the crane and winch, its facing in quarter turns. Kept outside the fixed choices: only when something's placed by hand, an extension follows the 16 characters (which pieces, 4 bits; then each one's cell and facing). A boat with nothing placed keeps 17 characters; one placed piece about 20, all four 26. The check character covers it all.
  - Version 9 codes (15 characters, the other chat's chart table) read with none of the new gear; everything older as before. `ALL_FIELDS` (the choices and the placed gear) is what variants check and merge.
- **The builder** (`build.ts`), in order, each piece kept clear (in plan) of what's already placed:
  1. the stern roller (in the transom bulwark, with its notch: `layout.fairleadGap`) and the A-frame's feet on her quarters;
  2. the gear placed by hand, at its pinned cell if it stands there, else the nearest cell within a metre that does, else its usual place with a warning ("won't stand where it's pinned"). Standing means: inside the bulwarks, clear of the house (and its door steps), the narrow bow and the transom, and of what's placed; for the searchlight and monitor on the roof, clear of the roof's edges, the masthead light and horn, and each other. The crane placed by hand stands exactly on its socket (its module's `side: 'socket'`), turned to its facing, its control post on its own starboard side; its weight is designed in where it stands, so she floats upright;
  3. the rest at their usual places: the winch 0.75 m forward of the transom (`CONFIG.shipyard.deckGear.winchFromTransom`, with `standRoom` forward of it), the crane at the deck edge, the poles off the house, the roof units.
  - The A-frame brings the winch (its warps lead off the drum); with no room for the winch, both are left off, with a warning.
  - The life ring on the house's aft wall, `ringFromCorner` in from the corner on its side, its line on that quarter's cleat; the boat-hook clips along that bulwark, aft.
  - The side door in the port wall, `sideDoor.fromConsole` aft of the console, forward of the chart table (the other chat's), `sideDoor.width` wide, up to the window band's top. Left off, with the reason, if the house is too short, too low, or there's no side deck outside to step onto (`sideDoor.sideDeck`, 0.5 m: room to stand clear of the deck edge; a designed workboat's house is wide, so a narrower one is needed).
  - The deck hydraulics' pump for the crane or the winch; prices (`deckGear.price`): winch £12,000, roller £2,000, A-frame and net £18,000, ring and hook £600, side door £3,000.
  - `DesignedBoat.placed`: where each piece placed by hand stands, whether it moved off its cell, on the roof or not; null if it went to its usual place.
- **The designed wheelhouse drawn with a side door** (`hullMesh.ts buildShapedHouse`): the wall below the window band split round the doorway, jambs, a header up to the band's top, a threshold, no band mullion in the doorway. The door itself, its sliding and walking through it were already general (the starting workboat's).
- **Pins** (`pinGear.ts`, `page.ts`): the equipment list is the eight pieces, all placeable. Grid pieces: the pin's point as a cell from her transom (the searchlight and monitor on the roof if the pin's on it; the crane facing forward on the foredeck, aft on the aft deck). If the builder moved it, the design is set to the cell it took, so it stays put. Crane and winch get a **Turn ↻** (a quarter turn). Deleting a pin takes its gear off; choosing a piece's place under "Or set by hand" puts it back in its usual place. Older pins' ids ('towPost', 'door') still read.
- **The brief:** the jobs' gear lines are now real checks: towing's tow point (the stern roller), trawling's gantry (the A-frame), rescue's life ring and boat hook. Nothing is "not in the Shipyard yet" any more.
- **The pot hauler:** built (a hydraulic davit and sheave hauling the line, as a module), then taken out again at the owner's word before anything was pushed: pots are hauled by hand.
- **Tests:** `design.test.ts` (version 10 and placed gear: 17 characters without, the round trip, the grid's corners and facings, snapping, a mistyped character in the extension; version 9 codes); `build.test.ts` (the crane on its pinned cell, turned, the module keeping it there, upright; the searchlight on the roof where pinned; the monitor on a pole; a pin on the house's side nudged clear; a pin over the side to its usual place with the warning; two pieces on one cell; all the working gear on a designed workboat with a narrower house, priced, and the side door's warning without a side deck); `workingGear.test.ts` (a designed workboat with winch, roller and A-frame tows, its winch heaving the line in, and trawls on a fishing ground); `pinGear.test.ts` (cells, roof, facings, transom, side, wall, off again); `brief.test.ts` (the jobs' gear lines real).
- **Checked in headless Chromium:** a designed workboat (house narrowed), eight pins by script: the searchlight on the roof where pinned, the crane on the aft deck facing aft (Turn: facing to port), the monitor on a foredeck pole, the winch with its wire aft, the roller and A-frame at the transom, the life ring to starboard, the side door in the port wall; no warnings; code 26 characters. Screenshots: plan, three-quarter from the stern, and the port side with the door. No page errors. **Not checked:** the Quest, a phone, the life ring and boat hook in the Shipyard's view (the game draws them, not the Shipyard), walking through a designed boat's side door in the game.

### More tows, in three sizes (owner: to test the Shipyard's more powerful boats)

- **Four new things to tow**, each a hull with its own drawn model (`tow/towLook.ts`), recipe (`boats/tow-*.json`) and hull (`boats/towHulls.ts`), set up in `CONFIG.vessels` as the first three were:
  - **dory**: an open fishing boat with a fouled propeller, 5.5 m, 1.3 t: blue, two thwarts, an outboard, a fish box;
  - **yacht**: a dismasted sailing yacht, 11 m, 11 t, ballasted low: white, a coachroof with windows, a cockpit, the mast broken off at the deck and lying along her with its boom;
  - **trawler**: a fishing trawler with her nets round her propeller, 18 m, 70 t: navy, a wheelhouse forward, a mast, a gallows over the stern, a net drum (her form factor 1.0, about three times a clean hull's, for the nets and the locked shaft);
  - **pontoon**: a crane pontoon, 20 m x 8 m, 123 t: the barge's shape, larger; a crawler crane with its boom down on a rest, two containers (bluff: form factor 2.5, an early wave rise).
  - Each floats on fewer physics stations than it's drawn with (4, 5, 6, 5), its mass and LCB set to what those stations displace at the DWL; angular damping scaled from the workboat's by mass x size^2. All pass the hydrostatic checks (floats level, GM 0.97 to 4.6 m, a righting arm to 60 deg).
- **Sizes** (`tow.size` on each, `TowLook` in `vesselDef.ts`): small (cruiser, dory), medium (log raft, barge, yacht), large (trawler, pontoon). Debug → Missions → Tow: **Small / Medium / Large** put one of that size astern at random (intent `towDebugNear` with ref `small` | `medium` | `large`; a kind's name still works).
- **The large ones pass a heavy hawser** (`tow.lineFactor` 2): the line parts at twice `tow.breakForce` (80 kN, 140 kN with the heavy towing post). The radio says so on the call. Otherwise a 400 kW boat's snatch on a 100 t tow would part an ordinary line every time.
- **Random calls:** `tow.weights` (dory 0.8, yacht 0.8, trawler 0.5, pontoon 0.4 beside the old three). **Pay** `career.pay.tow`: dory 350, yacht 900, trawler 1600, pontoon 2000 (cruiser 600, logs 450, barge 800).
- **Towed by the workboat** (calm water, lever eased up, steady; half / full lever): dory 8.1 / 12.3 kn; yacht 7.7 / 10.3; trawler 6.8 / 8.8 kn at 26 kN on the line; pontoon 4.8 / 5.7 kn at 33 kN.
- **Towed by a Shipyard pilot boat with twin 400 kW V8s and a stern roller** (the Shipyard's tow point, added by the other session meanwhile; half / full lever): dory 9.7 / 23.4 kn; cruiser 9.4 / 22.8; log raft 7.7 / 16.3; barge 7.6 / 13.0 at 32 kN; yacht 9.0 / 19.4; trawler 8.0 / 10.3 kn at 45 kN; pontoon 5.5 / 6.5 kn at 61 kN. The last two would part an ordinary 40 kN line: the heavy hawser holds them.
- **Tests:** the floating check covers all seven; new (`tow.test.ts`): the sizes, each heavier than the last; the debug picks a kind of the asked size; a pull of 1.5x the ordinary breaking load holds on the trawler's hawser and parts the barge's line. `seaTrials.test.ts`: the inclining check now allows the larger of 0.05 m or 3 % (the pontoon's GM of 4.6 m heels only 0.1 deg; unchanged for every other boat).
- **Checked in headless Chromium:** screenshots of the four new tows astern; no page errors. **Not checked:** the Quest.

### Shipyard: a deckhouse under the wheelhouse (owner)

- **The owner asked** for an optional lower "cabin" tier that the wheelhouse sits on, from photos of a rescue boat (a full-width deckhouse running forward under the wheelhouse) and a tug (a main-deck house set in from her sides). First step: the pilot-boat kind, no railings or walkable top; plan for tugs later, ideally with an interior.
- **The deckhouse** (`src/vessel/deckhouse.ts`, `layout.deckhouse`): in plan from its front `z0` aft to `z1` (just inside the wheelhouse's aft wall, so the house's own aft wall shows), its half widths along her (`plan`), its flat `top`, its front's rake. Its own layout piece, with helpers `deckhouseHalfWidth` and `inDeckhouse`, so a walkable top, ladders and an interior can hang on it later.
  - **Drawn** (`hullMesh.ts buildDeckhouse`): one lofted geometry along her (sides, top, front, aft face), from just below the deck under each part of it. Its raked front is the top brought down to the deck over the rake's run: one sloping face that follows her sides. The house's colour.
  - **Walked round:** the deck under it isn't walkable, and it's solid up to its top (`layout.ts`); **cargo** doesn't go on it (`cargo/deck.ts`).
- **The builder** (`build.ts`): from the wheelhouse's aft wall forward by `SCALES.dhLength` (0.5-3.5 m forward of the house; it stops `CONFIG.shipyard.deckhouse.fromStem` short of the stem), out to her deck edge less `edge` (0.12 m), or less a side deck (`dhWidth`: 0.3 / 0.5 / 0.7 m), never narrower than the house over it; its top at the highest deck under it plus `dhHeight` (0.8-1.4 m); its front upright or raked 30° / 50°.
  - The wheelhouse stands on it: its floor at the top (the floor choice set aside), the existing raised-floor steps up to its aft door from the deck.
  - **Weight:** its plate (sides, top, ends) at `kgPerM2` (35 kg/m²), its centre halfway up it: her centre of gravity rises by its share of her weight. With the house lifted onto it, a pilot boat's GM went from 1.16 to 0.77 m for a 3 m, 1.2 m high, full-width deckhouse. **Windage** and **price** (`pricePerM2`, £450/m²) too.
  - The crane's, poles' and pinned gear's clearances, and the foredeck's usual places, start from the deckhouse's front. The life ring hangs at hand height off the deck. The side door is left off with one (it would open onto its top), saying so.
- **Design codes** (version 11): the deckhouse's four choices (`DECKHOUSE_FIELDS`: dhLength 8 steps, 0 none; dhHeight 4; dhWidth 4; dhRake 3) ride in the code's extension as its most significant number, so every earlier code reads exactly as before, and a boat without one keeps her code; one with a deckhouse adds about 2 characters (a pilot boat with one: 20).
- **The page:** a Deckhouse section in the Wheelhouse step: Forward of the house (slider), Height, Width, Front.
- **Tests:** `tests/shipyard/deckhouse.test.ts` (codes with and without, with placed gear too; it stands from the aft wall forward, full width just inside the deck edge, the house on top with steps; set in, it leaves side decks, the deck under it closed, solid; GM drops a little but stays above 0.5, price up, deck room down; the side door left off with the reason).
- **Checked in headless Chromium:** a pilot boat with a 3 m, 1.2 m high, full-width, 30°-raked deckhouse, and set in with 0.5 m side decks, upright: views from the bow, stern and port; the wheelhouse on top, the steps up aft, no warnings. Found and fixed on the way: its faces wound inside out (invisible from outside), and its foot showing through her topsides at the bow. **Not checked:** the Quest, a phone, walking up the steps into a raised helm in the game.
- **Next, for bigger boats (tugs), noted:** the deckhouse top walkable with rails and a ladder or stairs (the walk area's floors and ladders already do this for the workboat's roof), and an interior with a door into it.

### Shipyard: her engines and propellers at the Engine step (owner)

- **The owner:** 3D models of each engine type, single or twin, with the calculated propeller size, drawn on the Shipyard page with the hull and wheelhouse see-through. They must not go into the game's 3D model, to keep it cheap.
- **Now** (`shipyard/enginePreview.ts`; `page.ts addMachinery`, `frameMachinery`):
  - **One original, generic model per engine type** (`ENGINE_LOOKS`, sized for each engine's power and weight):
    - the 150 kW straight six: long and narrow, a ribbed cover over one head;
    - the V8s: short and wide, two angled banks, a turbo on top, an intercooler across the vee (the 400 kW a size up from the 280);
    - the 450 kW tug diesel: big and tall, six separate heads, air and exhaust manifolds along its sides, a big flywheel housing and a heavy gearbox.
  - Each has a sump, a heat exchanger tank, a pulley, an alternator, a flywheel housing, the marine gearbox and mounting feet.
  - **Where they go:** from her design (`build.ts`). The engine is centred on the engine bed, its top just under the cabin floor. A twin installation has two engines side by side, a little inboard of the propellers. A shaft runs from each gearbox to its propeller, at her design's diameter (`figures.propellerM`) and position, with a rudder behind each.
  - **Labels:** the engine ("2 × 400 kW turbo diesel") and "Propeller ⌀ 0.86 m".
  - **The view:** shown only at the Engine step, inside the ghosts of hull and house, with the water faded so the propellers show. Arriving at the step, or changing the engine or twin there, turns the camera to the machinery.
  - **Never in the game:** they're built only by the Shipyard page.
- **Checked:**
  - Typecheck and tests (`tests/shipyard/enginePreview.test.ts`: a look for every engine, the tug diesel the longest, the gearbox flange as the origin; one or two propellers, set out to the twin positions, at the given diameter).
  - Headless screenshots at the Engine step: single 280 kW V8, twin 400 kW V8s, the tug diesel, the straight six.
- **Not checked:** VR (it's the Shipyard page, desktop and phone); a phone.

### Shipyard: sketching on her four views, together (owner)

- **The owner:** "sketching didn't work because it was trying to sketch in 3D space". They asked for sketching only on a side, top, front or back view, on one flat plane beside the model that everyone draws on, live in multiplayer. The front and back views were missing.
- **Now** (`shipyard/planeSketch.ts`; `page.ts`, "Sketching on her views"):
  - **Bow** and **Stern** views (square on, level) join Bow ¾, Side, Stern ¾, Plan and At the helm.
  - **✏ Sketch** turns the pen on. It goes to the Side view if you're not on one of the four, makes the view flat (no perspective), and stops it turning (the wheel still zooms).
  - **The plane:** each of the four views has one sheet of glass, standing `PLANE_GAP` (0.6 m) clear of her on that side. It's shown faint and squared every metre while you draw.
  - **How strokes are kept:** as `Ink` notes on sheet `@side` / `@plan` / `@bow` / `@stern`, in hull fractions across the view, so they stay on her when she's stretched (`toPlane` / `fromPlane`). `notes.ts cleanNote` lets plane strokes run up to her size again beyond her.
  - **What shows when:** a view's strokes show whenever the camera looks square on to it (`planeFacing`, within about 25°) and hide otherwise. Lines are drawn a few pixels wide whatever the zoom (three's Line2, part of three, no new dependency).
  - **Live:** a stroke being drawn is sent every `CONFIG.shipyard.sketchShareMs` (120 ms) as the same note, so the others see the pen moving.
  - **Rubbing out:** **↶ Stroke** takes back your last stroke on the view; **✕ Clear view** rubs out everyone's on it, after asking.
  - The snapshot sketches (✏ Sketch used to snapshot the view onto a 2D sheet) are no longer made. Ones already made stay in the Sketches list and still open.
- **Found and fixed on the way:** the Brief's paper (previous change) made the page crawl. Its pencil-wobble SVG filter was slow to draw, and the 3D view kept drawing under the paper every frame. In a session that was slow enough that a second browser timed out joining. The filter is gone, and the view doesn't draw while the paper covers it.
- **Checked:**
  - Typecheck and tests (`tests/shipyard/planeSketch.test.ts`: where each plane stands; points kept as fractions and put back, a stroke going with her when stretched; which view is faced; plane strokes may run beyond her).
  - Headless, one browser: strokes on Side and Plan, each hidden from the other views.
  - Headless, two browsers in a live session over PeerJS: Amy's Next twice moved both to Wheelhouse ("Amy moved everyone here"); Simon's Back moved both to Hull; Amy's stroke showed on Simon's screen while she was still drawing (30 points mid-stroke, 49 when done).
- **Not checked:** touch drawing on a phone or tablet; the Quest browser.

### Shipyard: the design flow made obvious, shared, and a view for each step (owner)

- **The owner** (after a full multiplayer test):
  - The step names along the top and the Next / Back buttons at the foot of the left panel competed, and Next / Back didn't keep a session together.
  - At the Brief, everyone turned the 3D boat round instead of agreeing the brief. They asked for a typed brief on official-looking paper, with an abstract drawing of the kind of boat.
  - At Hull, the wheelhouse shouldn't be there. At Wheelhouse, the hull should be faded so you know you're on the house but can still see her sides.
- **Now:**
  - **One step bar** under the title (`shipyard.html #flow`): **← Back** at its left; the steps with › between them, done ones ticked green; **Next: <the next step's name> →** at its right. The foot of the left panel no longer has its own buttons.
  - **The step is shared in a session** (`session.ts` op `step`, `Side.setStep`, `SessionEvents.onStep`; kept in the work as `YardDoc.step`, checked by `variants.ts cleanStep`). Anyone changing step moves everyone, and the bar says "Amy moved everyone here". Someone joining later arrives on the session's step.
  - **The brief on paper** (`shipyard/briefPaper.ts`): at the Brief step the 3D view gives way to a typed document on the yard's letterhead: reference, date and vessel name; her duties ticked; her requirements ("no requirement" where none is set); an arrangement sketch; the recommended hull type; signature lines; a DRAFT stamp, which turns to AGREED once a hull is picked.
    - The sketch is an abstract pencil profile, not to scale (`sketchPlan`): a deep short hull with a push fender for towing, a raked bow at 20 kn or more, otherwise a workboat. The house goes forward over a working deck if she works on deck. Each job adds a mark: crates, pots, a crane, an A-frame, a tow hook and line, a fire monitor and its spray, a searchlight and life ring.
  - **What each step shows** (`page.ts focusStep`; the hull and house built as two meshes for the Shipyard, `hullMesh.ts buildVesselMeshParts`; the game still draws one merged mesh):
    - Hull: the hull alone, with no house, gear or skiff.
    - Wheelhouse: the house (and deckhouse) over a ghost of the hull: faint glass with her edges drawn. Only the gear inside the house (console, seats, panels) is shown.
    - Engine: hull and house both ghosted. The engines and propellers come in the next change.
    - Deck gear, Controls, Paint, Trials: everything.
- **Checked:**
  - Typecheck and tests (`tests/shipyard/flow.test.ts`: a step anyone moves to reaches everyone and a latecomer starts on it; a bad step is ignored and the step is kept with the work; the sketch plan for each kind of brief; the paper escapes the name, shows the requirements, and is stamped draft or agreed).
  - Headless screenshots: the step bar; the Brief's paper with cargo, towing and fire ticked (and its sketch); the hull alone; the wheelhouse over the ghost hull.
- **Not checked:** the step moving everyone in a live two-person session (the protocol is tested; the page's wiring was not run with two browsers); a phone; the Quest browser.

### Shipyard: Try her together (owner)

- **The owner:** getting friends into a game together from a design session meant pressing Try her in the game, sending the link round, then hosting and typing the game code from the menu. And the game it loaded looked old (the lobster pots in their old place). "If there's a button to say test together, it knows who's connected and it should just load that URL for all the people connected as long as it loads into the right version of the game."
- **Why it looked old:** the game's page (`/next/index.html`) can be kept by the browser for up to ~10 minutes after a new version goes up (GitHub Pages' caching), and a tab left open keeps the version it loaded.
- **Now:**
  - **A Try her together button** beside Try her in the game, shown in a session with someone else in it (`shipyard/page.ts`).
  - **The press:** picks a 5-digit game room, tells the session (a one-off `go` message the keeper passes on to everyone but the sender: `shipyard/session.ts` `Keeper.go`/`Member.go`, `SessionEvents.onGo`), and goes into the game with `?design=CODE&host=ROOM`.
  - **Everyone else** goes into it with `?design=CODE&together=ROOM`.
  - **In the game (`app/App.ts`):** `host=` hosts in that room; `together=` joins it. A crew-mate who arrives before the host's game is open tries again: every `togetherRetryS` s, up to `togetherTries` times. An attempt not in after `togetherConnectS` s is dropped and retried (one made just as the host's game opened could hang).
  - **The right version:** every link into the game from the Shipyard now carries the time (`t=`), so the browser fetches the latest page rather than a kept copy. Try her in the game does this too.
  - **The version check:** the host's version (commit and build time) rides in `world.build.app`. A crew-mate whose page differs reloads once, past the cache (`fresh=`). If it still differs, the host is the old one, and it says so.
  - **Clean-up:** these start-up parameters are taken off the address once read. Back in the browser returns to the session.
- **Config:** `CONFIG.net` (`togetherRetryS` 2, `togetherTries` 20, `togetherConnectS` 8, `togetherLeadS` 0.6: the presser's page waits that long so the message is out before it closes).
- **Checked:**
  - Typecheck and tests (`tests/shipyard/tryTogether.test.ts`: a member's go reaches the keeper and the other member, not the sender; the keeper's reaches every member; a bad room or code goes nowhere).
  - Headless, two browsers over the real PeerJS server: a session; the member pressed it; both went into the game in the design; the presser hosted; the other waited, retried and joined (2 players aboard).
- **Not checked:** the version reload (both pages were the same dev build); the Quest; more than two people.


- **The owner** (in VR): with the console's wings following a faceted front, the throttle was too far away: "always keep that control only next to the wheel at the original distance".
- **Why:** two things carried it off: the console's layout is spread to the house's width (on the tug, the throttle went 0.82 m out from the wheel), and on a faceted front it went back with the wing.
- **Now:** the throttle and its pedestal are never further out than on the reference console (0.45 m from the wheel; closer on a narrow console, which squeezes the layout: `shipyard/build.ts`), and never set back with a wing (`console.standard` `wrap.fixed`). At 0.45 m it's on the console's square middle anyway.
- **Checked:** typecheck and tests (`tests/shipyard/facets.test.ts`: the throttle no further out than the reference, not set back); the game, desktop, headless: the throttle beside the wheel on a faceted design. **Not checked:** VR.


- **The owner** (on the change below, which raked the side windows' middle mullion with the front): "the forward most side pillar should adapt to the angle but the other should stay vertical, being cut if necessary".
- **Now** (`vessel/view/hullMesh.ts buildShapedHouse`): only the side windows' front post takes the front's rake; the middle mullion stands upright again. It now sits midway between that post (as raked, and set back with a faceted corner: it didn't allow for the facet, so on the tug it stood right at the corner) and the aft wall. Where a front raked back leans over it, it stops where the post meets it (cut short; with the facet allowed for, that's rare).
- **Checked:** typecheck and tests; the Shipyard, headless: the tug, three facets, raked aft, upright and reverse (profiles: the front post raked, the middle mullion upright midway along the band). **Not checked:** VR.


- **The owner saw**, with the front windows raked back (the top aft) on a three-facet front, the side windows' front posts not following the rake: a frame crossing the corner and the header sticking out forward of the roof.
- **Why:** a faceted front sets back everything near the front wall by the facet's angle at its x (`setBack`), but only geometry forward of a line just aft of the wall. Glass raked aft has its head aft of the wall, so the tops of the corner posts and the header were left where they were while their feet went back: they crossed.
- **Now** (`vessel/view/hullMesh.ts buildShapedHouse`): that line is taken from the glass's head when it's aft of the wall (`Math.max(zF, zH)`), so the whole raked corner goes back together.
- **Checked:** typecheck and tests; the Shipyard, headless: the tug, three facets, raked 22.5 deg aft (profile and the owner's view: the corner posts parallel, leaning aft, nothing crossing). **Not checked:** VR.


- **The owner saw** (a faceted, reverse-raked front, raked out all round) an upright post in the side windows right behind the raked front corner: "the side windows don't get the rake".
- **Why:** the side window band's middle mullion was built upright whatever the front's rake; on a short band it stands just aft of the raked corner post.
- **Now** (superseded above: upright again, only the front post raked) (`vessel/view/hullMesh.ts buildShapedHouse`): that mullion is raked parallel to the front windows (the front's shear, from the sill), so the side panes follow the front's line. Raked out all round, it also leans out with the side wall. The aft corner posts stay as they were (upright, or leaning aft with the aft wall).
- **Checked:** typecheck and tests; the Shipyard, headless: the owner's view of a faceted, reverse-raked front raked out all round (the two posts at the corner now parallel) and its profile. **Not checked:** VR.


- **The owner** is trimming the Shipyard's options: the roof's visor "should be overlapping the windows, a set level". (The floor height slider stays: the owner uses it.)
- **Now:** the Roof visor slider is gone; every design's roof reaches `CONFIG.shipyard.visor` (0.3 m, the old default) forward of the top of the front windows. The choice (`design.visor`) stays in the code so every code still reads, but the build no longer uses it: designs that had a longer or shorter visor (0.15 to 0.75 m) now have 0.3 m.
- **Checked:** typecheck and tests (737); the Shipyard, headless: a design's roof over its windows from the side. **Not checked:** VR.


- **The owner saw** (a tug, three facets, reverse-raked front) the console's dash standing in the window band right against the glass and its frames ("it intersects with the console... needs to be pushed back"); and that a front rake of its own makes no sense with the windows raked out all round.
- **Why:** with the sills one height all round (1.0 m), the dash (up to 1.31 m) now rises above the front sill, against the wall.
- **Now** (`shipyard/build.ts consoleBack`): the console, and everything placed by it (the helm stand, the breaker panel, the ramp button, the screens and VHF hung from the roof, the overhead switch panel, the binoculars, the side door's and chart table's limits), go aft until each part rising above the sill stands `CONFIG.shipyard.consoleClear` (0.2 m) behind the glass, anywhere from the sill up to that part's top (tightest at the sill for glass leaning forward, at the top for glass raked aft). The parts: the dash; with low sills, the desk's raised back and the screens on stalks; the screens hung from the roof. About 0.14 m for an upright or reverse-raked front, more for one raked aft (0.3 m and over at 30 deg). The floor in front of it is bare (`wheelhouse.consoleBack`; hullMesh's desk and layout.ts's walking follow it).
- **Raked out all round** now sets the front too: it leans out at `flareDeg` (15 deg, "reverse") with the sides, and the window rake slider is greyed out (its own setting is set aside).
- **Checked:** typecheck and tests (737; `tests/shipyard/flare.test.ts`: at every rake the dash stands at least 0.2 m behind the glass from the sill to its top, more raked aft; the helm and console go back together; raked out sets the front's rake); in the Shipyard and the game, desktop, headless: the owner's tug (three facets, reverse rake) from the port bow (the dash clear of the glass, a gap in front) and from the helm. **Not checked:** VR.


- **The owner asked** for an option with every window raked, like a tug's or offshore supply vessel's bridge, the door panels kept flat; then (on seeing it) for the windows to be one height all round, an option to bring them down below the console with the console's upright panel taken off and its screens left "floating", the aft door hinged (swinging out 90 deg so it doesn't clash), and the side door (sliding) only with upright side windows. And the wipers didn't grow with the windows.
- **"Side & aft windows: Upright / Raked out all round"** (Wheelhouse step; `design.flare`, version 19 in the code's extension above the later engines; 0 leaves earlier codes as they were).
  - Modelled as one smooth deformation of the house as built upright (`vessel/houseFlare.ts`): above the window sill the side walls lean out and the aft wall aft, `CONFIG.shipyard.flareDeg` (15 deg) from vertical, up to the window head, and the header and roof go out by the full amount (`D`, about 0.3 m on a 1.1 m band). It's linear in x and z, so flat walls stay flat; the front stays where it is and its panes widen toward the top to meet the leaning sides. Below the sill nothing moves, so walking about the house is as before.
  - The aft doorway's lintel stays upright, with plates either side closing it off to the leaning glass; its door is **hinged** on its port side (clear of the push buttons) and swings out 90 deg onto the deck (`wheelhouse.doorHinged`, `controls/WheelhouseDoor.ts`).
  - **No side door with it:** a sliding door wants an upright wall; the design says so and leaves it off.
  - The roof and ceiling go out with the walls; the sidelights stay on the roof's edge; the rain glass and the wipers move with the front.
- **"Window sills: Standard / Low (below the console)"** (`design.sills`, version 19, above the raked windows). One height all round now (owner): `CONFIG.shipyard.windowSills.standard` 1.0 m (it was 1.31 at the front, the dash top, and 1.0 at the sides: **earlier designs' front glass now comes down to the sides' height**, behind the dash), or `low` 0.75 m, below the console's 0.9 m desk.
  - **Low:** the console's upright panel (the dash) comes off (`console.standard` `bare`) and each screen stands where it was on a slim stalk from the desk with a small foot, so you see down past them over the bow. The duty board, breaker panel and ramp button come down below the glass; the life ring on the aft wall too.
- **Wipers sized to their panes** (`vessel/view/rainGlass.ts wiperFit`, replacing the fixed `wiperArm` / `wiperBlade`): for each pane, the longest blade that stays on the glass through the sweep: arm L = (h + 2p) / (1 + cos A), blade 2 (L cos A - p - margin), h the height of glass you look through (from the dash top, or the desk with low sills: `wheelhouse.viewSill`), p the pivot above the head; the sweep A at most `wiperSweepDeg` and narrowed so the blade stays `wiperEdge` inside a narrow pane. The shader takes each pane's arm, blade and sweep. Config: `CONFIG.rain.wiperMargin` 0.02, `wiperEdge` 0.06. **The starter workboat's wipers change too:** longer blades over more of her panes.
- **Checked:**
  - typecheck and tests (727): `tests/shipyard/flare.test.ts` (codes read back, earlier codes unchanged; every hull type raked out: the walls out by D at the head, nothing below the sill, the front unmoved, the aft door hinged, no side door with a warning; upright: no flare, a sliding door; sills one height all round, low: the bare console with its screens listed, the duty board and breaker panel below the glass; wiperFit: taller panes longer arms and blades, narrow ones shorter sweeps, the blade inside the pane through its sweep).
  - in the Shipyard and the game, desktop, headless: a faceted, reverse-raked workboat type raked out all round (bow and stern quarters, from the aft deck, the side deck and inside); the hinged aft door shut flush and swung open; low sills from the helm (the screens on stalks, the foredeck seen between them); in rain with the wipers on, the wet glass filling the widened front panes; the starter workboat's wipers sweeping in the rain.
  - **Not checked:** VR.


- **The owner noticed** that designs with a skiff had no midship cleat for her painter (the workboat has two, just aft of her wheelhouse).
- **Now** (`shipyard/build.ts`): a design carrying the skiff gets a pair, `cleatMidPort` / `cleatMidStbd` (`deck.cleat`, `end: 'midship'`, the workboat's module), on the bulwark tops at the house end of the skiff's deck: `CONFIG.shipyard.deckGear.midCleats.fromHouse` 0.4 m forward of the house (or its deckhouse) for a skiff on the foredeck, 0.4 m aft of it for one on the aft deck; kept `fromEnds` 0.6 m inside the mooring cleats. Where the crew working her alongside stand. A design without the skiff (or with no room for her) has none.
- They work as the workboat's: click one to lead the painter there (her bow within reach), again to let go (`vessel/physics/painter.ts` cleats 4 and 5).
- **Checked:** typecheck and tests (722): `tests/shipyard/anchorSkiff.test.ts` (every hull type, every skiff place: two cleats, port and starboard, between the mooring cleats, off the house on the skiff's side; none without her; the painter's cleats 4 and 5 found); `tests/painter.test.ts` (a design's skiff launched from her crane, led to the starboard midship cleat and held there in the simulation); in the game, desktop, headless: the cleat on the bulwark top just aft of the house, the skiff on the aft deck. **Not checked:** VR; leading the painter by hand in the game (the headless browser runs too slowly to get her afloat; the simulation test does it).


- **The owner noticed** that on a faceted wheelhouse the console's wings turned the throttle (and the other controls on them) with the wing: "the controls need to be orientated with the ship so forward is forward".
- **Now** (`modules/console/index.ts`): a slot on a wing is still set back with it, but keeps its own turn, so every control is square to the boat: the throttle pushed forward goes forward, a joystick's forward is the bow, switches flick fore and aft. The pedestals under the throttle and joysticks stay square too, set back as a whole (they were sheared with the wing). The dash, the desk and the group plates still angle back with the windows.
- **Screens are the exception** (`wrap.turn`, set by `shipyard/build.ts` to the console's `instrument.screen` slots): set into the dash's angled face, they turn with it, flush, facing the helm. Displays, not controls.
- **Why not move them all onto the middle segment:** it's 1 m wide (the middle pane), and the wheel, the DECK group and the horn already fill it; the throttle and the joysticks would crowd the wheel. Square on the wings, they work the same as on a flat console.
- **Checked:** typecheck and tests (`tests/shipyard/facets.test.ts`: wing slots set back; controls' turn as on a flat console; screens turned along the wing); in the game, desktop, headless, a faceted workboat with the advanced controls: the throttle, the joysticks and switches square, the wing screens flush with the dash. **Not checked:** VR.


- **The owner asked** for an engine with the tug in mind: a diesel of larger capacity, slower revving, for the torque a tug needs; a single installation only; lower revs all through its working range. And, while at it, twin engines to sound like two engines, with the drone as they go in and out of step.
- **The engine** (`shipyard/build.ts ENGINES`, the fourth): "450 kW slow-revving tug diesel (big straight six, 1000 rpm; single only)", 2,200 kg with its gearbox, GBP 170 per kW (the others 120).
  - Its torque curve, idle, governor droop and starter speed are the 1800 rpm engines' with every rpm scaled by 1000/1800, so it is slower all through: idles at 333 rpm, about 325 / 505 / 730 / 940 rpm at a quarter, half, three-quarter and full lever on the tug. Its torque is scaled up by the same factor (the same power at fewer revs: about 1.8 times the 400 kW V8's peak torque for 12 % more power). Its friction follows its torque and its flywheel is heavier in the same proportion; its governor adds fuel more slowly (`rackRise` 1.0).
  - **Single only** (`design.ts SINGLE_ONLY_ENGINES`): choosing it unticks the twin box, which is greyed out; a code asking for two is built with one, with a warning. The brief's engine search tries it single only.
  - **The propeller** (the owner's question): the build already sized it to her draught aft and her power, but capped at 1.05 m and the same for every engine. Now a slower engine gets a bigger one for its power (a propeller's best diameter grows as its revs fall: the power term is divided by the rpm share), up to `propMaxM` 1.4 m for this engine, as her draught allows. On the tug: 1.25 m (draught-limited) against the V8's 1.05 m, on a 2.14 gearbox (matched by trial as ever). Still an open propeller: no nozzle.
  - The alternator gives its full output from the engine's idle (it was from 600 rpm, the 1800 rpm engines' idle; `dieselInboard`), so the slow engine still charges at idle.
  - The engine bed now takes up to 1000 kW.
  - **The design code** (version 18): the fourth engine rides in the extension above the facets (`MORE_ENGINES`), as the tug hull did; 0 leaves every earlier code as it was.
  - **The tug now starts with it** (one engine; she had twin 400 kW V8s).
- **Measured on the tug** (her standard size, gearbox matched; the game's sea trials):

  | Engines | Top speed | Range flat out | Bollard pull | Price |
  |---|---|---|---|---|
  | 400 kW V8, single | 8.4 kn | 43 nm | 4.16 t | 473,000 |
  | 400 kW V8, twin | 10.1 kn | 56 nm | 8.32 t | 521,000 |
  | 450 kW tug diesel (single) | 9.0 kn | 44 nm | 5.05 t | 501,000 |

  The tug diesel pulls 21 % harder than the single V8 for 12 % more power: its bigger, slower propeller. Twin V8s still pull hardest, on nearly twice the power.
- **A bug found on the way:** the sea trials' bollard pull counted one propeller on a twin-screw boat (`vessel/seaTrials.ts`: the engine state's thrust is one shaft's; the game pushes with both). So every twin was reported pulling about what a single does, and the brief's hint said twins pull less. Now both count. The hull-type table (`shipyard/typeFit.ts TYPE_FACTS`) is re-measured with every engine fit; twins' pulls about doubled (e.g. the landing craft on twin 400s: 4.9 t, so she can now meet a towing brief's 3 t; the brief test says so).
- **Twin engines' sound** (`audio/engineAudio.ts`): each engine has its own sound (a second worklet and filter chain, only on a twin), together the same ~+3 dB as before. The second runs a slowly wandering share off the first's revs, at most 0.8 % (12 rpm at 1500), passing through zero, the sum of two slow swings (23 s and 9.7 s) so it never quite repeats: their beats drift in and out of step, the "wow-wow" drone. Only the sound: the physics still runs them in lockstep. Config: `CONFIG.engineTwinDrift` (`share`, `periodsS`), `engineTwinLevel`.
  - The sound is now rebuilt when the engine's rated rpm changes too, not only its voice (the slow engine shares the straight six's voice).
- **Checked:**
  - typecheck and tests (679): `tests/shipyard/tugEngine.test.ts` (every engine's code reads back, the first three's 17-character codes unchanged; the tug diesel rated 1000, idle 333, over 1.7 times the V8's torque, a bigger propeller, recipe valid; a twin choice built single with a warning); the tug's reference test now expects the tug diesel; the brief's tests updated for seven engine fits and the corrected twin pull.
  - in the Shipyard, headless: the tug with the tug diesel, 1.25 m propeller, 2.14 gearbox, no warnings; the twin box greyed out; in the game she starts and runs up to about 860 rpm at full lever alongside.
  - the twin sound rendered offline in the browser: a twin V8's loudness swells and fades by 29 % (a single's 4 %), 2.9 dB louder than a single.
  - **Not checked:** VR, or the sound by ear on the Quest.


- **The owner noticed** designs had no overhead switch panel and no foredeck or aft deck lights, which the workboat has. Asked for them as modules, and only with the advanced interior for now.
- **Now, with Advanced controls** (`shipyard/build.ts`), the same modules as the workboat's:
  - **the overhead switch panel** (`panel.overhead`, socket `overhead`): under the roof on the centreline, just aft of the hung NAV / WIND screen and over the helm. Narrower than the workboat's, with two switches hung from it: FOREDECK and AFT DECK (0.32 m wide). Her FM set stays where it was, hung on its own out to starboard.
  - **two deck floods** (`light.flood`, sockets `floodFore`, `floodAft`): a lamp on the roof's front edge and one on its aft edge, a little to port of the centreline (clear of the searchlight, the masthead light and the fire monitor), each aimed at the middle of its deck. On a faceted front the fore lamp goes back with the cut corner. Hand-placed roof gear keeps clear of them.
  - ~~the rail lights~~: fitted at first, then taken off at the owner's word ("not needed, remove this feature for now"). The panel has two switches; the `light.rail` module stays in the library (the workboat has it), ready if they're wanted later.
  - Both are on the deck-lights breaker (DECK LTS), as on the workboat. That breaker starts open in a cold start: close it on the breaker panel first.
- **Basic controls:** none of them (taken off with the other advanced items).
- **Cost on the Quest:** the same as the workboat's: two real spotlights, each hidden while off; the panel merged with her other fixed parts.
- **Config:** `CONFIG.shipyard.workLights` (`overheadAft` 0.7 m, the panel's face aft of the wheelhouse front; `flood.x` 0.35 m to port; `flood.inset` 0.1 m in from the roof edge; `flood.keepClear` 0.3 m). The panel's box and legends are `CONFIG.modules.overheadPanel`'s; the beams are `vessels.workboat.deckLights`'.
- **Checked:**
  - typecheck and tests (676; `tests/shipyard/workLights.test.ts`: every hull type, flat and faceted, with advanced controls has the panel with its two switches and both floods aimed down at their decks, no rail lights, and its recipe checks out; with basic controls none of them);
  - in the game, desktop, headless, at night on a faceted landing craft: the switches and their legends on the panel above the NAV / WIND screen, both floods on and the aft deck lit; by day, both lamps on the roof edges, clear of the searchlight and the mast.
  - **Not checked:** VR.


- **The owner** walked through the steps up to a raised wheelhouse's aft door in desktop mode.
- **Why:**
  - the deck you walk on carried on underneath the steps, so you could stay at deck height inside them;
  - their treads only counted in a 0.44 m strip down the middle (the doorway's width less the body's), though they're drawn 0.7 m wide. So off-centre you walked through them.
  - The steps inside a deep-sunk cabin had the same fault, with the cabin floor under them.
- **Now** (`vessel/layout.ts`):
  - the steps' footprint (the door's width plus half a body, over their length) is taken out of the deck and the cabin floor;
  - the treads count across that whole width, so the only floor there is the tread and you climb.
  - Beside them, the deck is as before; from the side you can step onto the lowest only.
- **Walking at a low frame rate** (`player/locomotion.ts tryMove`): a move that's refused is tried at half length before sliding along.
  - A long frame (0.4 m at the headless browser's ~4 fps; a dropped frame on the Quest) could reach over a 0.28 m tread to the step beyond, a rise too high, and stick on the first step.
  - Half way gets onto the tread, and the next frame on up. This is shared walking code, so every boat gets it.
- **Checked:**
  - typecheck and tests (673; `tests/shipyard/doorSteps.test.ts`: across the steps' width the only floor is the tread, never the deck; each a step up; beside them the deck; inside a deep-sunk cabin no floor under its steps);
  - in the game, desktop, headless, on a pilot boat on a 0.8 m deckhouse (three steps): walking forward on the centreline and 0.28 m off it climbs 1.15 → 1.51 → 1.83 → 2.16 → into the cabin at 2.49 m.

### Shipyard: a three-facet wheelhouse front (owner)

- **The owner asked** (the small tug picture) for an option where the middle front pane stands square across her and the two outer panes are angled.
- **"Front windows: Flat across / Three facets"** (Wheelhouse step; `design.facets`, version 17, above the later hull types (the small tug, version 16) in the code's extension, so 0 leaves earlier codes as they were).
- **The shape:**
  - the middle pane between the mullions (±0.5 m) stays square across;
  - the outer two are angled back `CONFIG.shipyard.facetDeg` (30 deg) from square to the side walls. That's a setback of (house half-width − 0.5) × tan 30 at the walls: about 0.5 m on a 2.8 m wide house;
  - full height, from below the deck to the roof, raked with the windows;
  - the roof follows them (owner, later: "should follow the design of the windows"): its front is square across the middle and cut back on the same angle outside the mullions, the chamfer running round the angled edges (`chamferedSlab` with `centre`, `dz`). The wood ceiling under it is cut the same way. The sidelights on the roof's sides go back with its corners (build.ts `sb`), and roof gear keeps clear of the cut corners.
  - a deckhouse under it is faceted too (owner: "it looks like it's split... the deck house should also inherit the same faceting"). Its plan's half width is capped by the same angle from its own front (build.ts `halfAt`): square across the middle (±0.5 m) at its front, the corners cut back at 30 deg, with a section where the cut meets her side so the edge is straight. Being ahead of the house, it's always wider than the house over it. One as wide as the house runs aft to the house's angled corners, so they stand on it. The facet's go/no-go is now decided before the deckhouse, so both follow the same one.
- **How it's drawn** (`hullMesh.ts`):
  - the front is built in three across (split at the mullions), then everything at the front is set back by `facetDz(x)` (0 across the middle, the facet's depth at the side walls). The side walls' front ends follow.
  - the floor is filled out to the angled walls (`planSlab`);
  - the rain glass and the wipers (`rainGlass.ts`) follow the outer panes too.
- **The console wraps round with the front** (owner, the next day: "the bridge instruments... also got the angled effect... a wraparound"). At first the whole console stood the facet's depth further aft. Now:
  - it stays where a flat front's is, behind the middle pane;
  - its wings, outside the mullions, are set back as the outer windows are: the hull's console body (`hullMesh.ts buildConsole`, `setBack`) and the console module's dash and group plates (`console.standard`'s `wrap: { centre, k }`);
  - each instrument on a wing is set back with it and turned to face along it (the slots' yaw is ±the facet angle);
  - the helm stands where it does on a flat front;
  - what stands beside the wings is set back by the facet at its own x (build.ts `sb(x)`): the breaker panel, the ramp button, the VHF, chartplotter and FM overhead, the binoculars, the monitor's gauge, the skiff crane's button, the side door and chart table;
  - walking keeps aft of the wings: the console's aft edge is a function of x (layout.ts `consoleAftAt`).
- **When it stays flat**, with a warning:
  - a house too narrow (under 0.25 m outside the mullions);
  - a house too short (less than 1.6 m behind the facets' depth: the console's 0.5 m and room to stand at the helm).
- **Checked:**
  - typecheck and tests (664 with the tug's; `tests/shipyard/facets.test.ts`: the code, with the tug's hull type too; the facet's depth from the angle; the helm where it was; every wing slot set back and turned, the middle ones not; a short house left flat; a deckhouse under it faceted, never narrower than the house over it);
  - screenshots of a 12 m workboat from the bow quarter, from forward, from above and at the helm; the tug and the workboat's wrapped dash from behind the helm.
- **Not checked:**
  - rain on the angled panes with the wipers going;
  - the game in VR.

### Shipyard: the roof chamfered on its front and sides (owner)

- **The owner** sent a picture of a small tug whose roof is chamfered on the front and both sides, the visor look. The Shipyard's roof slab had only its front face raked back.
- **Now** (`hullMesh.ts chamferedSlab`) its front and both sides are chamfered at the same "Roof edge" angle (30, 45 or 60 deg from the vertical); the aft face stays square. The underside reaches furthest out, and the top is set in by thickness × tan(angle): 0.1 m at 20 cm and 45 deg.
- **What follows from it** (`build.ts`):
  - the sidelights sit on the chamfered sides at mid-thickness, just proud of them (they were at the old square edge and would have floated);
  - gear placed on the roof keeps 0.15 m inside the smaller flat top.
- Nothing in the design code changes: it's the same choices, drawn differently.
- **Checked:** typecheck, tests (655), and screenshots of a 12 m workboat with a 20 cm roof at 30, 45 and 60 deg.

### Shipyard: the anchor, and the skiff with her crane (owner)

- **The owner found** the anchor and the skiff still weren't in the Shipyard. The other session had made both modules placeable (`deck.anchor-windlass`, `deck.tender-crane`), leaving the Shipyard choices to this chat.
- **The anchor** (`design.noAnchor`: 0 means fitted). Every boat should have one, so every design carries it, older codes included.
  - **Where:**
    - at the bow: the roller on the bulwark's top `anchor.fromStem` (0.35 m) aft of the stem, the windlass on the deck behind it;
    - on the ramp-bow landing-craft type: a kedge at the transom, facing aft. It goes on the port quarter, else the starboard, else along the transom toward the middle, last on the centreline (not with a stern roller there). Its windlass is `kedgeAft` (0.4 m) forward of the roller, so it fits a short aft deck. It's placed after all her other gear, on what's left.
  - **At the helm:** an ANCHOR switch, in a DECK group starboard of the wheel, kept with the basic controls too.
  - If there's no room it's left off, saying where it wanted to go.
- **The skiff and her crane** (`design.skiff`, `SKIFFS`): none; or the foredeck or aft deck, with the crane's column to starboard or port.
  - **Layout:** the cradle (3.6 m, with the skiff) runs forward of the column, as on the workboat, and the skiff goes over the column's side.
  - **Its own fit check:**
    - inside her beam at each end of the cradle and its middle;
    - 0.5 m clear of the stem, 0.15 m of the transom;
    - clear of the house itself and of its aft doorway (and steps, if any);
    - clear of her other gear;
    - the cradle on the centreline or shifted up to 1 m toward the column's side.
  - **What comes with it:** the deck hydraulics' pump, and the SKIFF CRANE button on the dash beside the ANCHOR switch (`consoleButton`).
  - **Which boats take it:** the 12 m workboat and 14 m pilot boat types take it on the foredeck with the house right aft, or the aft deck with it right forward. At their default house positions neither deck is long enough. The 9-10 m landing craft and gillnetter can't carry it. The warning says to move the house or lengthen her.
  - **In the Shipyard view** the skiff is drawn in her cradle (the game's skiff hull at the crane's stow point). In the game she's her own boat, carried by any boat with the crane.
- **Weight:** neither module weighs itself. A first try took their weight out of her hull as placed parts, and she came out light and trimmed. So their weight is in her lightship as a whole, and she floats on her designed lines.
- **Price:** anchor £3,500, skiff and crane £38,000 (`deckGear.price`).
- **Pins:** "Anchor and windlass" (puts it back on) and "Skiff and crane" (the deck and side from where the pin is) join the list. "On her now" shows both, with Take off (`pinGear.ts` `fitted`, `off`).
- **Code:** version 15. Both ride above the narrow deckhouse in the code's extension, so 0 (an anchor, no skiff) leaves every earlier code as it was.
- **Checked:**
  - typecheck and tests (652; `tests/shipyard/anchorSkiff.test.ts`: codes; every hull type gets its anchor and switch; the skiff on the workboat type's four places; every hull fits it or says why; pins);
  - Shipyard screenshots: the skiff in her cradle on the foredeck, the anchor's roller and windlass, the dash's ANCHOR switch and SKIFF CRANE label, the landing craft's kedge;
  - in the game, headless, with a design code: she carries the skiff; with the engine running the crane launch begins (rigged and hoisted out of the cradle); the anchor pays out chain.
- **Not checked:**
  - the full launch, recovery and driving the skiff on a design;
  - the SKIFF CRANE button pressed in the game (it's made when the game hands the skiff to the crane, so the Shipyard shows only its label);
  - VR.

### Shipyard: a deckhouse as wide as the wheelhouse, so a side door (owner)

- **Width "As the wheelhouse"**, the fifth choice: the deckhouse runs forward of the wheelhouse only, no wider than the house (narrower only where her bow is), and the house stands on it.
  - The house's own walls come down to the deck as usual, so her side decks alongside the house stay clear.
  - The floor height still counts from the deckhouse's top.
  - The other widths switch it off again.
- **The side door** is now allowed with it. With a full-width deckhouse it's still left off, and the warning now says how to have one.
  - **No steps outside it** (owner: the crew jump in and out; if it's too high, that's a bad design). Steps were built, then taken out at the owner's word before anything was pushed.
- **Code:** `design.dhNarrow`, version 14. It rides above the rails in the code's extension, so 0 leaves every earlier code as it was.
- **Checked:**
  - typecheck and tests (647; deckhouse.test.ts: the codes; the layout, forward of the house only and no wider; the side door fitted; the side deck clear);
  - a headless run: choosing it, then another width;
  - screenshots from the port bow.

### Shipyard: a true side view, and less sheer on the pilot boat (owner)

- **Side view:** its eye was a quarter of her length above what it looked at, so it looked down a little and wasn't a true elevation. It's level with it now, and stood back further (2.3 L, was 1.5 L) so a 14 m boat fits across the view, most of all in the flat view.
- **The pilot boat's sheer** (`src/hulls/designs.ts`, the 'pilot' study, which the Shipyard's pilot boat type is scaled from) rose 0.8 m from amidships to the stem.
  - Now 0.5 m, fair, with most of it in the last fifth: 1.1 m aft, 1.25 m amidships, 1.45 m at 80 %, 1.75 m at the stem (was 1.1 / 1.3 / 2.1, heights over her base line, scaled with Depth).
  - The hull study page (hulls.html) shows the same change.
  - Her underwater body is unchanged, so her trials and deck room (49 crates) are as before.
- **Checked:** typecheck, tests, and flat and perspective side views of the pilot boat.

### Shipyard: no handrails, and a flat view (owner)

- **Rails** (Hull step, under Protection): **Handrails** (as every design had, 0.4 m over the bulwarks) or **None** (bulwarks only: `layout.railHeight` 0, which the hull drawing already supported for the towed boats).
  - It's `design.rails`; version 13 of the code. It rides above hull protection in the code's extension, the way `guard` does above the deckhouse.
  - So 0 (handrails) leaves every earlier code exactly as it was, and an older game reading a no-rails code says it's from a newer Shipyard.
  - `tests/shipyard/rails.test.ts`.
- **Flat view** (a toggle among the view buttons): no perspective, so parallel lines stay parallel, as on a drawing. Side gives an elevation, Plan a plan.
  - How: an orthographic camera is drawn and picked with instead (pins work in it). It follows the perspective camera's direction, which the mouse still turns and zooms, and is as wide as that camera sees at the point it orbits, so switching keeps her the same size there.
  - "At the helm" turns it off: from inside the house a flat view would look in through its back.
- **Checked:** typecheck, tests (644), and screenshots: no rails from the bow quarter, the same in the flat view, and the flat side view.
- **Not changed:** the trial or weight for rails (handrails are light; left as before).

### A light mast under the masthead light (owner)

- **The owner noticed** the masthead light floating over the wheelhouse roof on every boat but the starting workboat, which has its signal mast. This was the landing craft and every Shipyard design: about 1.1 m up, on nothing.
- **Fix:** the navigation lights module (`light.navigation`) takes an optional `mast: { footY }` and draws a slim square pole from there (the roof's top) up to the masthead lamp. The pole is merged with her fixed parts, so it costs no extra draw call. On a roof you walk on (the landing craft's), you walk round its foot.
- **Config:** `CONFIG.modules.lightMast` (`size` 0.06 m, `keepClear` 0.15 m).
- **Where it's used:** Shipyard designs (`build.ts`, from the roof's top) and the landing craft (`landingCraft.json`, roof top 3.07 m). The workboat keeps its own mast and the skiff has no masthead light, so neither changes.
- **Checked:** typecheck, tests, and Shipyard screenshots from the side (landing-craft type and pilot boat).
- **Not looked at in the game:** the landing craft.

### Shipyard: projects (owner)

- **The owner found** no way to start afresh: the Shipyard always came back with the last design, its brief and its pins.
  - Why: it keeps one working copy per browser (`swvr.yard.session.solo`, the YardDoc) and reloads it every time. Favourites keep only a design's code, not the brief, pins or sketches.
- **Projects** (`src/shipyard/projects.ts`, under `swvr.yard.projects`, at most 20): the whole YardDoc by name, with a picture of the main design and a line (type and length, variants, pins, sketches).
  - The **📁 Projects** button in the header opens **Save**, **New design** and the list (**Open**, **Delete**). The project open now is marked; `swvr.yard.project` remembers which it is.
- **Saving uses her name** (or the type-and-length name). If another project already has that name, the new one is numbered "(2)", so nothing is overwritten by accident. Saving again under the open project's name updates it.
- **New design and Open save the work on show first** (unless it's the untouched default), then write the chosen doc as the working copy and start the page again on it. The address's design code is dropped, since it would replace her design.
  - Starting the page again is the simplest sure way to swap everything: the variants, the undo, the trial and the views.
  - Not allowed while designing together: it would swap the session for everyone. Save still works there.
- **Storage:** sketches are pictures, so a project can be a few hundred kB. If the browser's storage is full:
  - Save drops older projects' pictures, then keeps only the newest five, before saying it can't;
  - New and Open refuse rather than lose the work on show.
- New save key, so `next` and the game don't clash; the old working copy still reads.
- **Checked:**
  - typecheck and tests (634; `tests/shipyard/projects.test.ts`);
  - a headless run: a named design with a pin → New → blank (no name, default hull, no pins) → the list shows it → Open → name, hull, length and pin back, marked "open now";
  - a screenshot of the panel.
- **Not checked:** the Quest's browser, and a full storage.

### Shipyard: deck gear by pin only (owner)

- **The owner found** the Deck gear step's "Or set by hand" choices redundant next to the pins. They're gone: pins are the one way to put gear on.
- **In their place, "On her now"** (`page.ts showOnHer`, under the pinned list): every piece she carries and where. That's either "where pinned" with its offset from the centreline, or its usual place.
- **Take off** comes with each piece (`takeOff`): with its pin if a pin put it there, else just the design choice. This is still needed because gear can come without a pin: a hull type's own fit, an older code, a variant.
- **Checked:** typecheck, tests, and a headless run that pins, lists, and takes gear off (see below).

### Shipyard: deckhouse heights for big boats too (owner)

- **After trying the deckhouse on bigger boats**, the owner wanted the taller heights back, plus a low one. It's now **0.5, 0.8, 1.0, 1.2 or 1.5 m** (`SCALES.dhHeight`; `dhHeight` has 5 steps).
- Deckhouse codes from the last two changes read with a different height (only on `next`).

### Shipyard: lower deckhouses, and the cabin sunk into one (owner)

- **The owner said** the deckhouse was too tall for these small boats: its heights are now **0.4, 0.8 or 1.0 m** (`SCALES.dhHeight`; `dhHeight` has 3 steps, it had 4 from 0.8 to 1.4 m). A code with a deckhouse made before this reads with a different one: those were only a day old, on `next`.
- **The floor height now works with a deckhouse.** The owner moved the wheelhouse floor and nothing happened: it was set aside, the house standing on the deckhouse's top. Now the same slider is measured from the deckhouse's top:
  - level with it;
  - raised above it;
  - or sunk into it (the slider reads "0.4 m into the deckhouse").
  Sunk below the deck, the usual check applies: is her hull wide enough down there?
- **Sunk, the deckhouse's top is open over the cabin** (`DeckhouseLayout.well`, `vessel/deckhouse.ts`). Its top and aft face are drawn only beside the wheelhouse (`hullMesh.ts buildDeckhouse`); the wheelhouse's own walls go down inside it to the floor, and its aft door and steps work as before. The plate left out comes off its weight and price.
- `figures.floorOnDeckhouseM` (build.ts) gives the page the floor's height from the deckhouse's top.
- **Checked:**
  - typecheck and tests (630; `tests/shipyard/deckhouse.test.ts` adds the heights, and a sunk floor: open top, floor walked, not solid inside);
  - headless screenshots of a 14 m pilot boat with a 0.8 m deckhouse, floor level with it and 0.4 m into it (side, stern ¾, at the helm).
- **Not checked:** walking in through the door in the game.

### Shipyard: dark mode (owner)

- **The owner asked** for "the dark mode makeover" of the Shipyard page.
- **Every colour on the page is now a named token** at the top of `shipyard.html`'s style (`:root`, with `color-scheme: dark`): panels (`--paper`, `--card`, `--raised`), ink (`--ink`, `--ink-2`, `--muted`), lines (`--line`, `--edge`), the accent (`--accent` for text and borders, `--accent-strong` behind white text on buttons), the header (`--top…`), warnings, the handover verdicts, the compare bars, the glass behind the tabs and the key-figures line. Before, about 55 light colours were written in by hand. A later light theme, or a tweak, is one block to edit.
- **Drawn in code to match:**
  - the sea-trial charts (`trialCharts.ts`, `C`): a dark chart surface, light ink, the data blue lifted to `#4b93e8` and checked against the dark surface for lightness, chroma and 3:1 contrast;
  - the 3D view's backdrop (`page.ts`): dusk blue `0x24394a`, light enough that dark paints still stand out;
  - the compare pictures: a dark backdrop.
- **Left as they were:**
  - the person colours on pins and badges, and the white text on them;
  - the lighting of the boat.
- **Checked:** typecheck and 628 tests pass. Headless screenshots at 1600 px (the Brief, Hull, Deck gear, and Trials & handover steps) and at 390 px (phone).
- **Not looked at:** the compare overlay, the sketch editor and the Design-together pop-up. They use the same tokens.

### Shipyard: hull protection: fenders, a rubbing strake or tyres (owner)

- **The owner asked** for a hull choice in the Shipyard:
  - a rubber rubbing strake all round the boat, permanent;
  - fenders, the cheaper option, which the crew put out and take in;
  - tyre fenders, permanent.

  On seeing the first tyres (hung singly on chains), the owner sent a photo of a tug: the tyres should be fatter and in a close row, all but touching, with no strings. Changed to match, with one more on the stem for pushing.
- **The choice** (`design.ts` `guard`, `GUARDS`; the page's Hull step, under "Hull protection"):
  - 0 none;
  - 1 fenders (what a new design starts with);
  - 2 rubbing strake;
  - 3 tyres;
  - 4 strake and fenders (added: what most real workboats carry).
- **It does something in play** (`vessel/physics/guards.ts`; `contacts.ts guardContactAt`; `vesselPhysics.ts`):
  - **Contact points:** each guard has its own points on its outer face, standing proud of her plating, so it meets a quay or pier first:
    - fenders: three a side, out over the side, and only while they're out (`fenders.out`);
    - strake: on the corner of her deck edge, every 0.6 m, and across the transom;
    - tyres: a row along each side, and one on the stem.
  - **How each pushes back:** with its own spring, damping and grip (`CONFIG.contacts.guards`):
    - fenders: soft and slippery;
    - strake: firm;
    - tyres: soft and grippy.
  - **Damage:** each takes up `absorb` m/s of the approach speed before the knock counts as damage (`wear.ts`): fenders 1.2, strake 0.4, tyres 0.9.
  - **Her own points are unchanged:** her hull's contact points (keel, chines, deck edge) stay as they were, so a hard enough push squeezes a guard flat and reaches the plating.
  - **Only quays and piers:** guards don't count against rocks or the seabed.
  - **Cheap on the Quest:** guard points are only tested with a quay or pier within reach of her (`geography.ts blockNear`), so at sea they cost nothing.
  - **Measured:** a designed 12 m workboat driven sideways into Calder Haven's quay at 2.2 m/s takes hull damage of:

    | Protection | Hull damage |
    |---|---|
    | None | 0.095 |
    | Rubbing strake | 0.016 |
    | Tyres | 0 |
    | Fenders out | 0 |
    | Fenders in the basket | 0.095 (the same as none) |

    At 0.5 m/s none of them is damaged.
- **The starting workboat's fenders now work too:** the `deck.fenders` module's gear gives its points (`GearFacts.fenders.probes`). Out, they cushion her alongside. In, nothing changes, so the golden runs are identical (none puts the fenders out).
- **Drawn** (new module `hull.guard`, on a new socket type `hull.side`; merged with her fixed parts, so no draw calls of their own):
  - **strake:** a black half-round (7 cm) swept along her deck edge, across the transom and, on a square bow without a ramp, across the bow;
  - **tyres:** fat lorry tyres, about 0.9 m across with a small hole and 0.28 m wide, 0.92 m apart, so they all but touch. They hang plumb against her deck edge, covering its corner, where her deck is at least 45 % of its widest. One more is on the stem, facing forward, if she has no ramp. Each tyre is about 100 triangles: no chains drawn;
  - **fenders:** the existing basket and fenders. The basket goes aft to starboard on deck, else the next clear spot (port, aft of the house, then the foredeck); if there's no room the fenders are left off, with a warning. The stowed fenders now start lying along the bulwarks: in the Shipyard's preview, which never updates her, they used to sit at her origin.
- **Weight, drag, price** (`shipyard/build.ts`):
  - **Weight:** the strake (`kgPerM` 5) and the tyres (`kgEach` 45) are designed into her weight as the deckhouse is. Her displacement is unchanged, and her CG rises by their share.
  - **Drag:** tyres add `formFactorAdd` 0.03 to her form factor.
  - **Prices** (`CONFIG.shipyard.protection`): fenders £450; strake £110 a metre (about £3,000 on a 12 m boat); tyres £90 each plus £600 to fit. Her price is rounded to £1,000, so the fenders can disappear in the rounding.
- **Codes, version 12:** the choice rides in the code's extension, above the deckhouse.
  - None leaves every earlier code exactly as it was, and older codes read with no protection.
  - A guard adds three characters: 20 for a design with only that.
- **Config:**
  - `CONFIG.contacts.guards` {fenders, strake, tyres}: stiffness, damping, friction, absorb;
  - `CONFIG.modules.hullGuard`:
    - strake: radius, drop, kgPerM, spacing;
    - tyres: radius, hole, thickness, drop, spacing, minBeam, kgEach, formFactorAdd;
  - `CONFIG.shipyard.protection`: prices, and fenders a side.
- **Tests** (`tests/shipyard/protection.test.ts`, 8 new; 636 in all, all pass):
  - codes: none unchanged, each choice round-trips, also with a deckhouse and placed gear;
  - every hull with every choice: a valid recipe, level on her lines, no warnings, the right modules and gear;
  - the fender basket on deck, three fenders a side outboard;
  - the strake proud of the deck edge and across the transom;
  - the tyres in a close row, and one on the stem;
  - price, weight and drag;
  - drawn with her fixed parts and merging with them (that caught a missing-normals bug);
  - the alongside damage above, and gentle berthing doing no damage.
  - Also updated: the deck-fittings test (the fenders' points), the bus-key table (`contact.impact` now says "less what a fender, strake or tyre took up"), and the design and deckhouse tests (older codes read with no protection).
- **Checked in headless Chromium:**
  - Shipyard screenshots: the strake along the sides and across the transom; the tyres on the workboat and pilot hulls and the stem tyre; the fender basket and fenders stowed;
  - two designs opened in the game (`?design=`), with no page errors.

  Found and fixed on the way: the strake was wound inside out, so only the far side showed through the bow.
- **Not checked:** the Quest; driving onto a quay by hand; the landing craft and gillnetter with a strake, by eye (the tests build them).

### Shipyard boats into the game: Office > Your boats (owner)

- **The owner:** a way to bring the boats built in the Shipyard into the game, by copy and paste, and from VR, where pasting may not work in the immersive view.
- **No paste needed in VR** (`shipyard/takeHer.ts`, menu `ui/mainMenu.ts yourBoats`, Office > Your boats):
  - **Favourites:** the Shipyard saves them in this browser's storage (`swvr.shipyard.favourites`), which the game shares (same site), so the page lists them (5 a page, newest first, with the summary the Shipyard wrote) with **Take her** each. Designing in the Quest's browser and playing there needs no code at all.
  - **A code typed on a keypad** in the menu (the code's 32 characters, ⌫, Clear), for a design from another device. Codes are cleaned as the Shipyard reads them (case, dashes, I/L/O). A typed code is only offered from 17 characters: the first 13 of today's code would already read as an older, shorter (version 2-5) code, i.e. some other boat. The line under it says what she is ("Pilot boat, twin engines: ready to take").
  - **Desktop paste:** Ctrl+V anywhere in the game (not in a text box), or the page's **Paste** button (the clipboard API; the browser may refuse it, then it says to use Ctrl+V). A pasted code or a Shipyard play link (`...?design=CODE`) is taken whole, any version.
  - **Take her** restarts the game with `?design=CODE` (as the Shipyard's own Try her in the game; `?boat=` dropped). In VR the reload ends the immersive session: enter VR again. **Now** names the boat (a favourite's name if she is one) with **Back to the workboat**.
- `ALPHABET` is now exported from `shipyard/design.ts` for the keypad.
- **Tests** (`menu.test.ts`): the favourites listed newest first and Take her restarts in one; typing a code (not ready at 13 characters, ready when whole, shown in groups of five); paste of a code in lower case or a play link, other text left alone. The crew tab's keypad test now names its tab (the two keypads share keys).
- **Checked in headless Chromium:** two favourites seeded in the browser's storage; a play link pasted with Ctrl+V (a paste event) filled the code; Take her reloaded the game in her (`?design=`, her vessel type 'design'), and Now named her "Fast pilot (Shipyard)"; a picture of the menu page. No page errors. **Not checked:** the Quest (the keypad by laser, and re-entering VR after the reload).
- **Not done / noticed:** in multiplayer the crew very likely don't get the host's Shipyard boat (each browser builds the 'design' vessel type from its own address; not tested); the boatyard purchase (buying her with the career's money) is still to come.

### Shipyard: a fifth hull type, the small tug, with a push fender (owner)

- **The owner asked** for a new hull form for a small tug, from a reference render (a small tug with a raised red foredeck, grey topsides and a dark bottom), "the bow notably has a pusher thingy": a thick rubber push fender on a square bow.
- **The hull** (an original design in the hull study: `src/hulls/designs.ts` `pushTug`, "Small push tug", also in the viewer):
  - 13.0 x 5.4 m, 1.65 m draught, 65.9 t, hard chine.
  - **Coefficients:** L/B 2.41, B/T 3.27; Cb 0.61, Cp 0.77, Cm 0.79, Cwp 0.92 (a full waterplane: the square bow).
  - **Profile:** full almost to the bow, which ends in a square push plate about two thirds of her beam (`halfBeam` 1.75 m at the stem). The sheer is low aft (the towing deck, 0.95 m) and rises strongly to 2.0 m at the bow. Aft, a raised run over the propellers (keel -1.0 m at the transom); amidships full depth (-1.65 m); forward, the bottom sweeps up in a spoon to the foot of the plate, just above the waterline (+0.35 m).
- **In the Shipyard** (`build.ts`, `DESIGN_HULLS[4]`):
  - **Her bow is her own** (`pushBow`): the bow-rake choice leaves it as it is, and the page's slider reads "push bow" and is disabled (`scaledStudy` with no bow).
  - **Layout:** `cockpit` 3.0 m (a long towing deck), `foredeck` 1.6 m.
  - **Defaults, from the render:** a short house forward of amidships with its floor raised 0.4 m to see over the bow, windows 7.5 deg reverse-raked, twin 400 kW, the rubbing strake, rescue red.
- **The push fender** (new module `hull.push-fender`, `modules/pushFender`, on a `hull.side` socket at the stem; since split into two push knees, below):
  - **Shape:** a block of black rubber `thickness` 0.32 m thick, its outer corners chamfered, across the bow plate (`inset` 6 cm in from each side), from the bulwark top down to just above the plate's chines.
  - **Drawing:** merged with her fixed parts, so no draw calls of its own.
  - **Weight:** `kgPerM2` 140 per m² of face, designed into her weight high at the bow.
  - **Price:** `CONFIG.shipyard.pushFenderPrice` £4,500.
  - **Contact:** its face is probed at 5 x 3 points (`across`, `up`) against quays and piers, with its own material (`CONFIG.contacts.guards.pushFender`: stiffness 2e5, damping 4e4, friction 0.8, absorb 1.2 m/s).
- **Boats against boats now see the guards** (`vesselContact.ts guardSamples`): the push fender, a strake or tyres, and the crew's fenders while out, so the tug pushes another boat on her fender before her bow plate meets it. Boats without guards, or with fenders in, are unchanged; the golden runs are identical.
- **Design codes, version 16:** the code's first 16 characters only hold four hull types, so a fifth rides at the very top of the extension (`MORE_HULLS`; `HULL_TYPES` 5). It's 0 for the first four, so every earlier code reads exactly as before; 1 is the tug, whose first 16 characters hold hull 0. A bare tug's code is 22 characters. `ALL_FIELDS` gives `hull` 5 steps for checking and merging designs.
- **The brief's ranking** (`typeFit.ts` `TYPE_FACTS[4]`), measured as the others were (standard size, bare, each engine fit, gearbox matched, the game's sea trials):

  | Engines | Top speed (kn) | Range (nm) | Bollard pull (t) | Price |
  |---|---|---|---|---|
  | 150 kW | 6.2 | 35 | 1.56 | £443k |
  | 2 x 150 kW | 7.7 | 41 | 1.56 | £461k |
  | 280 kW | 7.6 | 36 | 2.87 | £459k |
  | 2 x 280 kW | 9.1 | 46 | 2.87 | £492k |
  | 400 kW | 8.4 | 43 | 4.16 | £473k |
  | 2 x 400 kW | 10.1 | 56 | 4.16 | £521k |

  Deck room: 79 crates or 53 pots; at her largest, 122 or 83. Good for: towing.
- **Things to look at with the owner** (not changed):
  - **Bollard pull is low for a tug:** 4.2 t on 800 kW, where a real one would show 10 t or more. The Shipyard's open propeller is capped at 1.05 m, and her twin fits pull the same as her single ones (as on the other types: the propeller sizing). Nozzles (Kort) and a bigger propeller for a deep tug would be the fix.
  - **Range is short:** the tank is sized by engine power, not hull.
  - **She's dear:** price goes with displacement.
  - **Paint:** there's no red-and-grey tug livery; the paint list is full in the code (8 steps).
  - **One bulwark height:** the Shipyard has one height all round, so there's no higher foredeck bulwark as in the render.
- **Tests:**
  - `tests/shipyard/tug.test.ts` (6 new; 661 in all, all pass):
    - she's in the lists, and her code round-trips with the extension's other choices; the first four types' codes are unchanged;
    - she builds level, stable, short and beamy, with twin screws, a strake and no warnings; her bow is square and her sheer rises to it;
    - the push fender's place and points; no draw calls; it merges;
    - only the tug has one;
    - nosing into Calder Haven's quay at 2 m/s, she's stopped by over 20 kN with no damage, where a workboat hull is damaged;
    - pushing a workboat broadside on her fender pushes her back before her bow plate would touch.
  - The bow-rake test now expects the push bow to stay as it is. The other Shipyard tests loop over every hull type, so they run on the tug too: every engine, slider ends, gear placement, anchor and skiff, protection.
- **Checked in headless Chromium:**
  - the Shipyard's Bow ¾, Side and Stern ¾ views of her, and the Hull step with her card and the disabled "push bow" slider;
  - the hull study viewer's new tab;
  - her code opened in the game (moored at Calder Haven, no errors).
- **Not checked:** the Quest; pushing a tow by hand in the game.

### Calder Haven: the goods and the pots by the boat (owner)

- **The owner:** move the lobster pots and the cargo at the start harbour closer to where the boat is moored.
- She starts at the cargo berth (`calder-cargo`, centre 708.5, 660, heading north: aft deck z ~661.5-666), the quay edge at x 711.
  - **The goods stack** (`archipelago.ts` PORTS calder `stackX/stackZ`): 716, 652 to **714.8, 666**: its row runs north from there 0.9 m a slot (to ~662 with five items), 4 m in from the edge, abeam her aft deck. It was 10-14 m forward, by her bow.
  - **The pot pallet** (`CONFIG.potting.pallet`): 719, 638 to **716, 670.5**: just aft of her stern, 4-5 m in. It was ~25 m forward, near the fuel berth.
  - Both clear of the quay lamp post at 716, 668 and of where you start on the quay (713, 661.5). Landing cargo at Calder (within `cargo.deliveryRadius` of the stack) and selling a catch there move with them.
- **Checked:** typecheck, all tests (golden runs unchanged); in headless Chromium the five goods and five pots at their new spots, screenshots from above the berth and from the quay. No page errors. **Not checked:** the Quest.

### The small tug: two push knees instead of one block (owner)

- **The owner said** splitting the big black block on the bow into two separate vertical ones would look better.
- **Now two push knees** (`modules/pushFender`, `kneeCentres`):
  - **Shape:** each a column of rubber `kneeWidth` 0.6 m wide and `thickness` 0.32 m thick, chamfered 8 cm (`chamfer`). They run from the bulwark top down to just above the plate's chines, as the block did.
  - **Placing:** centred `kneeAt` 0.55 of the way out from her centreline (about 0.93 m each side on the standard tug), so the bow plate and the rubbing strake show between them.
  - **Contact:** each is probed on its face at 2 x 3 points (`across`, `up`).
  - **Weight:** goes with their face area: about 0.6 t together, where the block was about 0.9 t; GM 1.06 to 1.07 m.
- **Config:** `CONFIG.modules.pushFender` {knees 2, kneeWidth 0.6, kneeAt 0.55, thickness, chamfer 0.08, inset, clear, kgPerM2, across 2, up 3}. The module's config (the plate's half-width, foot, top and station) is unchanged, so codes are unchanged.
- **Tests** (`tug.test.ts`): two knees, either side, the plate clear between them (no point within 0.3 m of the centreline); nosing into the quay at 2 m/s still does no damage; pushing another boat still meets the knees first. All Shipyard tests pass.
- **Checked:** Shipyard screenshots from Bow ¾ and from ahead. **Not checked:** the Quest.

### Refuelling by hand: the pump's hose and her filler (owner)

- **The owner:** every boat (the workboat, the landing craft, Shipyard boats) needs a filler, a round cap on deck; each harbour's fuel pump a flexible hose, drawn as the towline is. Grab the nozzle, walk it out (a reach of about 10 m, no collisions), plug it into the filler (a click spot when close), walk back and start the pump; a gauge shows how much; stop it, or it stops when full; then take the nozzle out and hang it back on the pump.
- **The sim** (`fuel/fuelHose.ts`, `world.fuel`, so the crew see the same):
  - each pump's hose: the nozzle **in its holster**, **in a player's hand** (moved by its holder, `hoseMove` every 0.1 s, kept within `fuelHose.reach` 10 m of the outlet, flat), **on the quay** (let go anywhere else; over the water it swings back to the pump) or **in a filler**;
  - intents `hoseTake` (anyone's but someone else's in hand; from a filler it stops the fuel; from the pump it zeroes the gauge), `hoseMove`, `hoseDrop`, `hosePlug` (the filler within reach of the pump), `hoseStow`, `pumpStart` (nozzle in, at a fuel berth and slow, not full), `pumpStop`;
  - the fuel flows by the menu's Refuel (`vesselControl.ts stepRefuelling`, `refuelRateLps`, stops when full or she leaves the berth) and is billed the same way (career.ts, when it stops). The gauge counts the litres through the hose since the nozzle came off the pump (`gaugeOf`);
  - **pulled out:** a boat whose filler drifts `pullOut` (1.5 m) past the hose's reach pulls the nozzle out; the fuel stops.
- **Fillers** (`fillerPoints`): every boat with a diesel, on her side deck each side, `filler.aft` (0.4 m) aft of her wheelhouse, `filler.inset` (0.3 m) in from the deck edge; worked out from her hull, so Shipyard designs have them with nothing added.
- **Drawn** (`fuel/fuelView.ts`): the pump (moved from worldView.ts) facing its berth: a red cabinet (worn paint), a white top, a gauge (litres, price, her tank, PUMPING; redrawn at 4 Hz when it changes), green START and red STOP, the holster, the outlet low on its side; the hose (black, 16 instanced pieces, sagging and lying on the quay or the water, `hoseLength` 11 m); the nozzle; the fillers (a chrome cap in a dark ring, one instanced mesh), with a green ring on the one the nozzle in your hand would go into. About four draw calls a pump, drawn only within 160 m, plus one for the fillers.
- **Hands** (`fuel/fuelHands.ts`): VR grip the nozzle to take it; let go at a filler (its ring lit), or pull the trigger there, to plug it in; let go at the holster to hang it up; START / STOP by touching and gripping or pulling the trigger. Desktop: click the nozzle (it rides in front of you), click a filler, the pump, or anywhere to put it down; click START / STOP. Reasons say why not ("Put the nozzle in her filler first", "Bring her alongside the fuel berth and let her settle", "She's full").
- **Brannock's pump** moved abeam its berth (-550, 314 to -556.6, 309.3): it was 8 m along the T-head, so a boat lying there one way had her filler 11.7 m off.
- The menu's one-click **Refuel** stays.
- **Config:** `CONFIG.fuelHose` (reach, pullOut, hoseLength, the pump's parts, the filler's place, grab / button / plug distances, desktop reach and hand).
- **Tests** (`fuelHose.test.ts`): fillers on every diesel boat; at both fuel berths, either way round, the quay-side filler within reach (3 to 5.4 m); take, carried 30 m held at 10 m, plugged, START, 10 s filling, the gauge, STOP, billed; stops itself when full, START refused with the nozzle out or full; drifting off pulls it out; put down on the quay and picked up again, hung up; dropped over the water back to the pump; someone else's nozzle can't be taken.
- **Checked in headless Chromium:** the desktop path by its own label / click (take, the filler under the reticle, plug, START), fuel flowing and the gauge counting; screenshots of the pump with the nozzle hung up, pumping, and the hose from the pump to her filler. No page errors. **Not checked:** the Quest (gripping the nozzle, the trigger at the filler, pressing the buttons by hand).

### Fix: the fuel pump's gauge counts from START (owner)

- **The owner:** the pump read 25.6 L, but the boat's fuel readout had gone up only 6 L.
- **The cause:** the gauge went back to nought only when the nozzle came out of the pump's holster. Taken out of the filler and put down on the quay (or left in the filler) instead of hung up, the next fill carried on from the last: an earlier ~20 L plus this 6 L. The fuel itself was right: in every boat (workboat, landing craft, a twin-V8 Shipyard design), engine running or not, the tank and the litres through the hose agree to the litre.
- **Now** (`fuelHose.ts pumpStart`): every START zeroes the gauge, so it reads what this run of the pump puts in her (it still zeroes when the nozzle comes off the pump, too).
- **Test** (`fuelHose.test.ts`): two fills, the nozzle put down on the quay between them, never hung up: the second reads its own litres, as her tank does. On the old code it read 26.1 L for 6.0 L in the tank, the owner's case.

### The starter workboat, and Shipyard boats ready for the game (owner)

- **The owner:** keep the workboat as the boat a new game starts in, but simpler: start with less equipment and buy the rest as you earn. First the trawl gear and the skiff. Then close the gaps found when checking whether she could go:
  - Shipyard boats get no rescue calls;
  - the bait tub isn't needed (pots always baited, a simpler loop);
  - basic controls have no VHF;
  - crew joining a host in a Shipyard boat must get her;
  - Shipyard boats have little test cover.
- **The starter workboat:**
  - a **new career** starts in the workboat without the **trawl gear** (A-frame, net and drum, the TRAWL switch) and without the **skiff and her crane**. Both are bought at the chandlery: `CONFIG.career.upgrades` `trawlGear` (£2,500, rep 5) and `skiff` (£4,000, rep 10). Their new `fit` field lists the sockets of her recipe the yard fits (`helm/trawl` for one in the helm console);
  - built by `boats/library.ts setWorkboatFit` / `sims.ts useWorkboatFit`: her recipe with those sockets left empty;
  - the tests' `workboat` is the **whole boat**, as before. The fit-out is only applied by the game (App `startFit`: from the career in the slot last used, read before the world is made, `careerSession.ts savedCareer`).
  - **old careers keep the whole boat:** a save without `kit` (made before this) is given all the equipment (`career.ts parseCareer`); saves now carry `kit: 1`. The live game ignores `kit` and drops the new upgrade ids, so a career played there again reads back on /next/ with the whole boat. No new save keys were needed.
  - **the refit:** when the career's equipment changes (bought, **New career**, another slot), the page starts again 2.5 s later with her refitted (App `checkRefit`; her views and controls are built once from her recipe). In VR you enter VR again; crew aboard are dropped (the host's page reloads).
  - **Bigger trawl** and the **ice machine** now need the trawl gear aboard (`needs: 'fishing.trawl'`, with a new `needsName`). The workboat's equipment is "Workboat only" on other boats. The `needs` check now reads the whole recipe (`sims.ts hasModule`): the trawl has no simulation part, so it wasn't found before.
  - **Debug → Boat → Start in:** Workboat (as the career has her), **Workboat, all gear** (`?fit=all`, for testing), Landing craft.
- **Shipyard boats get the rescue calls** (`shipyard/build.ts`): a design with a **life ring** now has rescue places in her hull's fittings. Survivors come aboard over her transom's centre at the waterline and sit three abreast on the larger open deck (aft of the house, else the foredeck). The rescues already follow any home boat with rescue places; one without a life ring gets no calls.
- **The bait tub is gone, every pot baited:**
  - potting.ts: no `baited` on pots, no bait factor in the catch (`potting.catch.unbaited` removed), no `potBait` / `potQuickBait`;
  - potHands.ts: the tub, the bait in hand and the pot's "bait it" action removed (and `potAction` from cargoHands);
  - the menu's **Bait all** removed, as are `stowage.baitTub` and `CONFIG.potting.baitBox`.
  - The catch is what a baited pot caught before.
- **The VHF in the basic controls:** every Shipyard boat has it, to answer calls, hear the forecasts, the tutorial and the harbours (build.ts no longer takes `vhf` off for basic; the Shipyard page says so).
- **Multiplayer: crew build the host's boat:**
  - `world.build` (App) records her Shipyard code and the workboat's equipment left off. On the welcome the crew compare it with their own boat (`sameBoatAsHost`); if it differs, the page reloads with `?design=` / `?boat=`, `?fit=` and `?join=CODE`, builds her, and joins again by itself (`join` and its `fit` are taken off the address once read);
  - a second mismatch, or a design with no code (an older host), is "That game is a different version";
  - **fixed on the way:** the crew's copy of the snapshot listed the world's parts one by one and had missed the **pots**, the **fuel hoses**, the home boat and the quiet-calls switch. Crew now take every part but their own player.
- **Tests:**
  - **`shipyard/inTheGame.test.ts`** (31): five Shipyard boats pinned by their codes, one of each hull type with different gear and controls (a basic-controls landing craft; a gillnetter with a skiff and side door; a workboat type with crane, tow gear, searchlight and monitor; a twin pilot boat with a deckhouse; a twin tug). Each:
    - reads back and builds with no warnings;
    - has a diesel and fillers, a VHF, the hand gear, a life ring, boat hook and rescue seats on her deck;
    - lies quietly at the start berth (and her skiff in its cradle);
    - makes her pinned speed flat out (within 5 %: 19.5, 10.3, 13.2, 23.9, 10.1 kn);
    - turns over 40° in 15 s at the helm, and loses her headway full astern within a minute;
    - takes a survivor aboard by the life ring.
    - Also: a design without a life ring gets no calls.
  - **`starterWorkboat.test.ts`** (8): a new career's equipment left off; the starter boat valid, without the four modules, the rest aboard (towing, rescue, VHF, searchlight, monitor); no skiff, the TRAWL intent does nothing; each purchase brings back its own gear; the whole boat again; old and new saves; the yard selling it; Bigger trawl needing the trawl gear; "Workboat only" on a design.
  - Changed: potting and quick-jobs tests (no bait), the Shipyard basic-controls test (VHF in basic), the career upgrade test (Bigger trawl / ice need the trawl).
  - `npm test`: 98 files, 715 tests pass. `npm run typecheck` clean.
- **Checked in headless Chromium:**
  - a new browser: the starter workboat (no A-frame, no skiff, no crane; screenshots of the aft deck, the foredeck, the dash with no TRAWL or SKIFF CRANE);
  - an old-format career: the whole boat;
  - **New career:** refit to the starter;
  - **trawl gear bought** in port: refit, A-frame and net aboard, £2,500 off;
  - **Workboat, all gear**;
  - **multiplayer**, two separate browsers over PeerJS: a host in a Shipyard design with the crew in the starter workboat (the crew's page reloaded into the design and joined again by itself, 2 aboard), and a host in the whole workboat (the crew rebuilt her with her skiff and joined). No page errors.
- **Not checked:** the Quest (re-entering VR after a refit or a rebuild for a host).
- **Next, if the owner wants them:**
  - more of her equipment left off at the start (searchlight, fire monitor, the advanced instruments; a fixed towline on the post with the winch as an upgrade: that needs a new module);
  - selling the starter boat towards a Shipyard boat (nothing yet spends career money on a design).

### The starter workboat: no searchlight or fire monitor either (owner)

- **The owner:** take the searchlight and the fire monitor off the starter boat too.
- **Two more items at the chandlery** (`CONFIG.career.upgrades`, with `fit`):
  - `searchlight`, £1,500, rep 5: the roof searchlight, the SPOT switch and its joystick (`searchlight`, `helm/spotlight`, `helm/spotJoystick`);
  - `fireMonitor`, £3,000, rep 10: the roof monitor, the FIRE PUMP switch, its joystick and the FIRE gauge (`fireMonitor`, `helm/firePump`, `helm/monJoystick`).
- **Fire calls** already come only to a boat with a fire monitor (`fire.ts tug`), so the starter gets none until it's bought. Night rescues: the hand torch is still aboard, as is the boat hook.
- **The helm console** (`boats/library.ts setWorkboatFit`): a group plate with nothing left on its switch row is left off. Without both, the red SEARCH · FIRE plate goes; LIGHTS, DECK and ENGINE stay. The whole workboat's recipe is untouched (her console keeps its own defaults).
- Old careers still have everything (a save without `kit` gets all the equipment).
- **Tests** (`starterWorkboat.test.ts`, now 10):
  - the four items left off and their sockets;
  - none of the gear or its switches aboard, the horn, towing, rescue gear, VHF and torch still there;
  - the console's plates;
  - no fire call without the monitor, one with it.
  - `npm test`: 99 files, 720 pass (after the latest `next`); typecheck clean.
- **Checked in headless Chromium:** the starter's roof (no searchlight or monitor) and dash (no SEARCH · FIRE plate). Searchlight bought in port: the page restarts, the SPOT switch, its plate and the joystick are back, £1,500 off. No page errors. **Not checked:** the Quest.

### Desktop: look round while holding the wheel (owner)

- **The owner:** desktop players have to look down at the wheel to grab it, and while they hold it the view is stuck: they can't look up and around.
- **Now** (desktop only, `app/desktopPointer.ts freeLook`): holding the wheel or a lever (left button), **hold the right button** and the mouse turns the view.
  - The control stays held where it was (the mouse's moves don't reach it), and there are no binoculars.
  - Let go of the right button and the mouse works the control again.
  - Off the wheel, the right button is the binoculars as before.
  - Free look lasts until the right button is let go, so letting go of the wheel first doesn't snap into the binoculars.
  - The switch happens at the click itself, not on the next frame, so no stray movement turns the view or the wheel.
  - The reticle says "hold the right button to look round" / "looking round: let go of the right button to steer".
- The levers (the throttle) work the same way: they freeze the view in the same way. VR is unchanged.
- `InteractionSystem.desktopDragging` tells the pointer a control is held.
- **Checked in headless Chromium** (the mouse simulated, pointer capture stubbed), aboard at the helm aimed at the wheel:
  - left drag turned it (helm 0.38) with the view still;
  - right down, the mouse turned the view (yaw -0.55) with the helm held at 0.38, no binoculars;
  - right up, the mouse steered it back to 0 with the view still;
  - off the wheel, right down: the binoculars (fov 70 to 10).
  - No page errors. **Not checked:** a real mouse and pointer lock; there's no unit test (the pointer is DOM input).

### Landing slipways, the ramp's toe flaps, the Shipyard landing craft's landing bow (owner)

- **The owner:**
  - slipways at suitable ports where a bow-ramp boat pulls up; once her ramp is on the slip she's docked, the waves no longer moving her;
  - mid-way, to make the ramp reach further: the classic toe flaps on the ramp's end, flopping down as it's lowered (a set animation is fine);
  - then: the Shipyard landing craft's bow is too deep for the ramp to come down at a good angle. Real ones are a square platform on a planing hull, so always raked: take the plumb option away from that type.
- **Why it needed thought:** the ramp is hinged at the top of the bow plate (1.3 m above the water) and is 1.2 m long. So, lowered, its lip is still 0.6 m up, about 1 m above a slip in front of her. Two things make it reach:
  - a beaching bow: the game's landing craft already has one (her keel rises to +0.12 m at the bow plate, about 10°), so she rides well up a 1:8 slip;
  - the toe flaps.
- **The slipways** (`world/archipelago.ts SLIPWAYS`): concrete planes, 6 m wide, 1:8, from about 1.5–1.8 m above MSL ashore to about 1.7 m under the water.
  - **Calder Haven:** just south of the quay's south end, 28 m long, up eastward onto the waterfront.
  - **Selkie Bay:** up the beach west of the bothy, by the goods stack, 26 m. It gives a ramp boat a way to land cargo there without the skiff.
  - In the ground (`terrain.ts slipSurface`, inside `groundHeight`), so a hull grounds on them and you walk on them.
  - Drawn (`worldView.ts buildSlipway`, in the one structures mesh, no extra draw call): the slab down to the seabed, kerbs, grip grooves, a yellow line along the top.
  - The terrain round each slip is drawn on a 1 m grid instead of 6 m, sunk 0.15 m under the slab. Its edges follow the coarse grid's, so there are no cracks.
- **Landing** (`world/slipway.ts`, `VesselState.slip`, stepped after each boat's physics in `core/simulation.ts`):
  - **When:** a boat with a bow ramp, her ramp lowered, the lever not astern, slower than `slipway.maxSpeed` (1 m/s), within 20° of the slip's line, within `range` 4 m of where she'd lie and 1.5 m of its centreline.
  - **Drawn up:** at `landSpeed` 0.8 m/s, at least `landSec` 2 s.
  - **Landed:** held, the waves no longer moving her. Her pose is reset after her machinery runs each tick, so the engine, electrics and so on carry on as usual.
  - **Her landed pose** (`landedPose`): level, at her waterline, on the slip's centreline, as far up as her keel allows (every station clear, the first just touching).
  - **Coming off:** the lever at `releaseLever` (-0.25) or more astern, or Menu → Boat → Cast off. A debug move (`placeVessel`) also clears it.
  - **In port:** `cargoPortAt` gives the slip's port, so cargo, the harbour office and quick jobs count her there.
  - **Messages:** "Landing on…", "Landed on…: walk off down the ramp. Go astern to come off", "Off the slip"; Menu → Boat shows it.
  - **Debug → Boat → Hull → On a slip** (`slipDebugLand`) lands her on the nearest slip.
- **The toe flaps** (`controls/BowRamp.ts`; `layout.bowRamp.flap`: `length` 0.7, `count` 4, `gap` 0.04, `flopAt` 0.6, `hangDeg` 75):
  - fingers along the lip, one mesh (one extra draw call on a ramp boat);
  - folded back on the walking face while the ramp's raised; from 60 % of the way down they flop over, to hang at 75°, or to lie on the slip at the angle worked out for it (`slip.flapDeg`, bisection to the slip's surface);
  - the Shipyard's ramps carry them too.
  - Landed on either slip, the landing craft's flaps lie at 37°, their tips 0.19 m above the water.
- **Walking off** (App `withRamp` / `crossRamp`; `slipway.ts rampFloor`, `rampCrossing`):
  - landed with the ramp all the way down, her walk area takes in the ramp and flaps (deck, lip, tip);
  - walking down past the flaps' tips you're ashore on the slip; walking up onto them you're aboard (a 0.2 m gap between the two lines, so you don't flick back and forth);
  - VR and desktop alike.
- **The Shipyard landing craft's landing bow** (`shipyard/build.ts`, `DESIGN_HULLS[0].landingBow`):
  - she keeps the hull study's own forefoot (the keel from -0.48 m amidships to +0.12 m at the bow plate), as the game's landing craft does. Before, the Shipyard's stem rake replaced it with a raked stem down to full depth;
  - the bow-rake slider is locked for her ("landing bow"), as for the tug's push bow: no plumb;
  - landed, her flaps lie at 54°, tips 0.05 m above the water. At the deepest hull settings her deck is higher and they hang about 0.2 m short, onto wet concrete;
  - her draught amidships is unchanged (0.45 m): only the bow was deep;
  - **existing codes:** a landing-craft code reads the same but now builds with the landing bow, whatever bow rake it was saved with;
  - re-measured (`typeFit.ts TYPE_FACTS[0]`, every engine fit, gearbox matched, the game's sea trials): about 0.5–1 kn faster, 5–10 % more range, £6,000 cheaper, the same bollard pull. The pinned landing craft in `inTheGame.test.ts` makes 20.6 kn (was 19.5).
- **Tests** (`slipway.test.ts`, 8):
  - the slips in the ground, clear of the quays, deep water off the toe;
  - the landing craft's landed pose: keel clear and just touching, flaps on the slip above the water, stern still over it;
  - the Shipyard landing craft likewise, her bow the same whatever the bow choice;
  - an approach at dead slow with her ramp down: landed, then held exactly for 30 s of swell, in port, engine running;
  - astern: off and backing away;
  - ramp up: no landing; the workboat never;
  - moved: off the slip;
  - the ramp floor running downhill from deck to tips, and the crossing lines.
  - Changed: the Shipyard bow-choice test (the landing bow, like the push bow, isn't changed by it), the pinned landing craft's speed.
  - `npm test`: 100 files, 728 pass; typecheck clean; golden runs unchanged.
- **Checked in headless Chromium:**
  - both slips drawn (screenshots before and after the terrain fix);
  - the landing craft landed on each, the ramp lowering with its flaps flopping over, the view down the ramp from the foredeck;
  - walking (W) down the ramp: ashore after 3 s; turned round and walked up: aboard after 2.5 s;
  - a Shipyard landing craft landed at Calder (flaps 54°), and the Shipyard page's bow slider locked on "landing bow".
  - No page errors.
- **Not checked:** the Quest (walking the ramp in VR, the flaps' look), and a whole approach driven by hand in the browser (the test drives one).

### The Shipyard landing craft's lines, from the owner's references

- **The owner** (a GA of a 10.75 m aluminium daughter vessel, and a photo of an aluminium landing craft): the V-form planing hull runs into a box section for the ramp, keeping its V up the steep rake. Fixed, like the tug, is fine.
- **Her lines** (`shipyard/build.ts landingCraftLines`): the hull study's landing craft with her bow redrawn.
  - Her keel: -0.45 m at the transom, -0.48 m at 55 %, -0.42 m at 66 %, then up a steep, nearly straight beach plate (about 25°) to +1.0 m at the bow, just under the deck (1.3 m).
  - Her chines are held about 0.25 m over the keel up the rake (`chineHeight` rising to 0.8 of the closing depth at the bow), so the V stays. Above them, her slab sides run on to a square box section 0.3 m deep under the ramp.
  - The study's own design (and the game's landing craft, built from it) are unchanged: the game's landing craft is the test boat, and her mass and handling are tuned to her present lines.
- **Landed on a slip:** at her standard size the flaps lie at 41°, tips 0.15 m above the water, dry. At the deepest settings they hang just 0.06–0.14 m short, still above the water. The beach plate lets her ride further up than the gentle forefoot did.
- **She floats on her lines**, so the forefoot cut away (about 1.2 t of displacement) comes off her weight.
  - Faster and cheaper, re-measured (`typeFit.ts TYPE_FACTS[0]`): e.g. a single 280 kW V8 25.6 kn (20.6 with the earlier landing bow, 19.5 with the deep stem); a single 150 kW 15.8 kn (11.2); range up 15–30 %; about £7,000 cheaper.
  - Bollard pull is a little lower on three fits (the gearbox matched to her speed).
  - Her rated payload (30 % of her weight) is about 0.35 t less.
  - The pinned landing craft in `inTheGame.test.ts` makes 22.5 kn.
- **Existing codes** for this type build with the new lines.
- **Checked:** `npm test` (101 files, 735 pass, after the latest `next`), typecheck. Headless Chromium screenshots: her profile, bow quarter and head-on (the V bottom running into the box under the ramp), and landed on the Calder slip, flaps on the concrete. No page errors. **Not checked:** the Quest.

### Release notes for what's new since v1.0 (owner)

- **The owner asked** for a release-notes style update on everything added since Friday night. `docs/RELEASE_NOTES_next.md` covers Friday after the v1.0 notes to Sunday 18 October, all sessions' work. It says what's already in the live game (Friday evening's potting, hand gear, deck gate and so on) and what's only on /next/. It's linked from README.md beside the v1.0 notes.

### Wake, planing spray and wind foam: a first pass (owner)

- **The owner asked** for three things: a prop wash behind a boat on a high throttle even when she's slow (a tug pulling); a bolder wake and much more spray once she planes; and white horses and wind streaks on the sea in strong winds. Then, on the streaks: "probably needs to be a little bit more transparent or toned down".
- **Prop wash** (`vessel/view/wakeTrail.ts`): the foam behind her now also comes from the screw's jet, by actuator-disc momentum theory.
  - Jet speed u = √(V² + 2T/(ρA)) − V: T her thrust per shaft, A the disc (πD²/4, her propeller's diameter), ρ `ocean.density`, V her headway. A tug at bollard pull throws a jet of about 8 m/s; under way it drops off.
  - The foam is carried aft by it and slows as it mixes in: it travels u·τ·(1 − e^(−t/τ)), with τ `effects.wake.jetTau` (2.2 s).
  - A wash on a high throttle widens the trail (`effects.wake.washSpread` 0.9 m per unit of wash), whatever her speed. Going astern, the wash goes forward.
- **Planing wake:** the hull's planing range (Froude number `planing.fnStart`..`fnFull`, on the landing craft and Shipyard designs) gives a planing factor 0..1.
  - Planing, the trail is up to `effects.wake.planingSpread` (1.6×) wider, whiter and more opaque, and her wash never falls below 0.85.
- **Planing spray** (`vessel/view/spray.ts`, `effects.spray.planing`):
  - sheets of spray thrown out and up from both sides, where her bottom meets the water `rootFrac` (18 %) of her length aft of amidships, at `sheetRate` per metre run. Struck off still water, they keep only 30–45 % of her speed, so they stream away astern in a fan;
  - a low mist kicked up behind her transom (`sternRate`);
  - each lives as long as it's in the air. The pool is up to `effects.spray.maxParticles` 900 (one draw call) and the drops are a little larger.
- **White horses and wind streaks** (`ocean/shaders/ocean.frag.glsl`, `ocean.windFoam`), from the wind of the moment (`windVector`):
  - **white horses** from Beaufort 4 (`capsFrom` 5.5 m/s) to full at force 7 (`capsFull` 13.9): small breaking crests, more of them as the wind rises, mostly on the steeper faces, drifting downwind;
  - **wind streaks** from force 6 (`streakFrom` 10.8) to full at force 9 (`streakFull` 20.8): thin, faint, broken lines along the wind, about `streakLength` 90 m by `streakWidth` 3.5 m of noise, drifting at `drift` 0.6 m/s. Toned down after the owner's comment: a constant-width hairline, at most 22 % foam;
  - none in sheltered water, and they fade out past 250–900 m.
  - The shared foam noise texture moved to `ocean/foamNoise.ts`.
- **Cost on the Quest:** four extra texture reads per ocean pixel, only from force 4 up; up to 900 spray particles in one draw call, only when planing; nothing new in the simulation.
- **Checked:** `npm test` (101 files, 739 pass, with new wake tests: the jet at rest and under way, astern, the planing factor), typecheck, build. Headless Chromium screenshots: the tug at full throttle at 3 kn (a wash astern), the landing craft planing (a wider, whiter wake, side spray), a gale and force 5 (white horses, faint streaks). No page errors.
- **Not checked:** the Quest, at 90 Hz. In the slow headless browser the spray sheets looked shorter than they should, as its frames are long; they need a look in VR and on a fast desktop.

### Fix: the waves stuttered while the sea changed (owner)

- **The owner saw** the waves go "laggy" after changing the weather or the sea state in Debug.
- **The cause** (`environment/weather.ts rebuildWaves`): a new sea state changes the waves' periods, so their frequency and their length. The rebuild kept the surface continuous only at the middle of the map (0, 0). Everywhere else the change of wave length shifted the waves by (k_new − k_old) × the distance from there. The rebuild ran once a second while the sea built or settled, so the waves jerked once a second. Near the harbours, about 1 km out, that was clearly visible, and 10× worse with Fast ×10. The debug sea-state buttons didn't keep the phases at all.
- **The fix:**
  - the surface is kept continuous where the players are: `EnvironmentState.seaAnchor`, the middle of the players (each one aboard counts at her position), set by the host each tick (`core/simulation.ts`). φ_new = φ_old + (ω_new − ω_old)·t − (k_new − k_old)·(D·a);
  - the waves are rebuilt as soon as the sea has changed by 1 part in 10,000 (`WeatherState.wavesScale`, most ticks while it builds), not once a second: small steps, so far from the players only a gentle drift;
  - the debug sea-state buttons rebuild the same way.
- **Checked:** `npm test` (101 files, 740 pass; a new weather test aboard 1.7 km out, a squall building the sea at ×10: the water's largest change in a tick is 0.01 m, the waves' own motion, where it was 0.7 m once a second before), typecheck. In the game (headless Chromium, the starting berth, the Storm sea at ×10): the water beside the boat changed at up to 0.97 m/s before, 0.06 m/s after. **Not checked:** the Quest.

### VR hand gestures, and your own hands in VR (owner)

- **The owner asked** for VR hand gestures (a fist, a pointing finger and the middle finger), worked by grip and the stick when the hand isn't holding or working anything, and to see your own hands in the Quest browser for feedback. No more rigging (no elbows).
- **Controls** (`player/handGesture.ts`, `CONFIG.avatar.gesture.stick` 0.6 of the stick's travel):
  - nothing pressed: relaxed (the mitt round the controller, as before);
  - grip: a fist. With nothing in reach it still grabs the world, as before (you pull yourself along with a fist);
  - grip, then the stick forward: point; grip, then the stick back: the middle finger. The finger stays out while the grip is held, until it's let go;
  - while the grip is held on a free hand, that hand's stick is the gesture's: it doesn't walk (left) or snap-turn (right). Pointing or giving the finger, the hand doesn't grab the world, so it stays put;
  - a hand holding or working anything (controls, cargo, gear, binoculars, chart tools, the fuel nozzle, pots, a survivor: `busyHands`) makes a fist on its grip and no gesture; its stick works as usual.
- **The hands** (`net/avatarOutfits.ts handGeometry`): `rest` is the mitt; the others a closed fist (the back of the hand, four knuckles down the front, the thumb on top, the cuff). Point: the index finger out straight ahead. Rude: the middle finger out (a little longer), the thumb folded across the front so it stands alone. The finger points along the hand: turn your hand to aim it. Each look and side's four hands are built once and shared (`handGeometries`): a gesture just swaps a mesh's geometry.
- **Your own hands** (`player/ownHands.ts`): in VR your own mitts in your outfit's colours (the ones crew-mates see on you) at each controller, in the pose of the moment. They take the place of the controller models: those were fetched from the WebXR input-profiles CDN and didn't show in the Quest browser. Two small meshes, fewer draw calls than the controller models.
- **Multiplayer:** the pose goes in the player's pose as `poses` [left, right] (`HAND_POSES` codes); the host takes two known codes or relaxed hands (`net/hostSession.ts`). Desktop players and older versions show relaxed hands.
- **Checked:** `npm test` (103 files, 747 pass; new `tests/handGesture.test.ts`: the controls, a busy hand, the shapes, through the host), typecheck. Headless Chromium screenshots of crew-mates' hands in every pose (the fist, pointing, the middle finger turned up), and your own hand attached to a stand-in controller, hidden out of VR. No page errors. **Not checked:** the Quest. The headless browser has no VR, so I haven't seen your own hands on real controllers, or how the grip and stick feel.

### A crew-mate overboard: the life ring rescue (owner)

- **The owner asked:** a crew-mate who falls in can wave, you see it, throw them the life ring, they get in it, and you pull them in with the line.
- **Seeing them** (`app/App.ts`):
  - a player's pose now says whether they're in the water (`PlayerPose.swimming`, kept by the host as `avatar.swimming`). Their crew-mates get "Man overboard: <name> is in the water! Throw them the life ring" once;
  - **waving:** a VR player waves their real hand (their avatar shows it, head just above the water). A desktop player holds **Y** (`KEYS.wave`): their avatar's right arm goes up over the head, swinging side to side.
- **The ring** (`rescue/recovery.ts`): it's thrown and hauled exactly as for a rescue call's survivors (the same throw, line and hand-over-hand pull).
  - **Taking it:** the swimmer's own game sees the floating ring within `CONFIG.rescue.crewCatchRadius` (2.5 m) and sends `ringGrab`, with a buzz in both hands. The host allows `crewCatchSlack` (1.5 m) more for lag, and nobody else must be on it. `RingState.player` says who's in it. A shout: "<name> has the ring: haul in!".
  - **Towed in:** in the ring, the swimmer's own game (it moves their body) carries them with the ring, no strokes of their own, as the line comes in. The ring isn't put back on its hook while they're in it, and nobody can take it from them.
  - **Out:** they climb out as usual at the boat (grip the gunwale, transom or swim ladder, or A / Space by the hull), which lets go of the ring (`ringLetGo`); A / Space away from a hull just lets go. The host also lets go for them once they're aboard anything or gone from the game. Reeled in and empty, the ring goes back on its hook.
  - **The propeller:** in the ring near her stern with her in gear, they shout "Neutral! Put her in neutral, I'm by the propeller!" (every 6 s).
- **The line's hover text** on desktop says "your crew-mate is on it!".
- **Checked:** `npm test` (105 files, 754 pass; new `tests/crewOverboard.test.ts`: thrown, taken, not snatched back, hauled in, not stowed under them, let go, out of reach, the propeller shout, gone from the game; the swimming flag through the host), typecheck. In the game in headless Chromium: me in the water 12 m off her stern, the ring floated by me, it was taken on its own; eight pulls hauled me in to her stern on the ring. No page errors. **Not checked:** the Quest, and two real players over the network (the test drives the host's side).

### Test address for work in progress (owner request)

- **Two addresses, one site:**
  - https://tartanski-cpu.github.io/SWVR/ is the game, built from the dev branch, as before.
  - **https://tartanski-cpu.github.io/SWVR/next/** is work in progress, built from the new branch **`next`**.
- A push to either branch rebuilds both (`.github/workflows/pages.yml`). A push to `next` goes through `next.yml`, which only wakes the Pages workflow. GitHub lets only the dev branch deploy the site; the first try, deploying straight from `next`, was refused. Each must pass `npm test`. If `next` fails, the game is still published and /next/ shows a short notice instead.
- **Telling them apart:** the next build's menu header starts with **NEXT** (then its commit and date) and its browser tab reads "Workboat World: NEXT". The build sets `VITE_CHANNEL=next`, read in `vite.config.ts` as `__CHANNEL__` and `__BUILD__`.
- **How milestones go out from now:** to `next` first for the owner to try, then to the dev branch when the owner is happy.
- **Shared storage:** both addresses are one site to the browser, so they share career saves, settings, the chart and the whiteboard. That's harmless while the save format is the same. Before a milestone changes it (M6), `next` gets its own save keys.

## Next

**Next big step: modular boats** (the owner's separate prompt; see "Direction: one engine, three games" above). The mobile and procedural games wait until the owner asks.

- **Modular boats: under way.** See "Modular boats" below and the plan, [`docs/MODULAR_BOATS.md`](docs/MODULAR_BOATS.md).

Everything on the lists above is done or noted as open below. What was open when last reviewed: the owner's VR test of the latest rounds; a moon (the night sea is very dark); whitecaps; harbour lights that don't grow as you near them; two upgrades suggested but not built (a bigger fuel tank, a second skiff motor). The older suggested order follows, kept for the record:

1. **Owner VR test** of fuel and temperatures, harbours, anchoring and refuelling. Then tune contact stiffness, the shelter factors and the menu size and placement.
2. **Weather** (wind, current), which gives the anchor and mooring lines something to do, plus mooring lines and walking ashore.
3. **Charts:** the world data already has coastlines, depths and ports.
4. **Missions** (rescue tasks), on hold until the owner asks. When they start, a mission is a small state machine in `WorldState` (plain data, stable ids) that reads world state each tick and emits events ("survivor spawned", "objective complete"). It never touches rendering.

For performance on the Quest, read the debug panel's cpu/gpu lines in VR:

- **FPS below 90 with low cpu:** the GPU is the limit. Lower `xr.framebufferScale` or raise `xr.foveation` in `config.ts`.
- **Headroom on both:** try `framebufferScale` 1.2 for sharper instruments.

## Known issues / notes

- **Shipyard, for later (owner):** the skiff and her crane are placed near the centreline; she should go out toward the side picked (port or starboard) so the crane can reach over it. The side picked is already in the design (`design.skiff`); it's where `build.ts` seats the cradle and column.
- **Water inside the hull:** the ocean is drawn wherever it is, so green water over the bulwark in big rolls can show "inside" the boat. Freeboard is 0.95–1.5 m, so it's rare in the current sea state. The fix is a hull-interior depth/stencil mask (see "Decision" above).
- **Collisions** are with the terrain, quays and piers only. The boat passes through the hazard buoys.
- **Fixed-size lights:** harbour lights are constant pixel size, so they don't grow as you approach.
- **No whitecaps or foam** beyond a faint crest tint.
- **The ocean at night is very dark** (no moon yet).
- **Beam-sea roll** is near resonance: the roll period is 3.5 s and the sea has energy at 2–7 s. Roll damping was raised to 15 % of critical; bilge keels or a lower GM would be the naval-architecture levers if it's still too lively.
- **Controller models need internet** on the headset (CDN). Without it, the hands are invisible but still work.
- **Wave fading at distance:** far objects (more than about 40 m from the viewer) can sit a few cm off the drawn surface for the shortest waves. Physics always uses the exact CPU surface.
- **Tooling quirks:**
  - Headless SwiftShader (used for automated screenshots) mis-renders geometry below the horizon at exactly zero camera pitch. Real GPUs are unaffected. The desktop camera starts tilted slightly down.
  - npm 10 crashes with `edgesOut` when adding packages (vitest optional peers). `npm ci` works. Use `npx npm@11 install` to add dependencies.

## Multiplayer

Version 1 (shared boat and avatars, peer-to-peer) is done on the `multiplayer` branch; see above and [`docs/MULTIPLAYER.md`](docs/MULTIPLAYER.md).
