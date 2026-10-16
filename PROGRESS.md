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

## Direction: one engine, three games (owner plan, not started)

The owner plans for SWVR to grow into three games. Agreed approach: **one repository with a shared core** (physics, boats, sea, weather, tow and rescue rules), not three separate projects and not long-lived git branches, so a physics fix reaches every game at once. Each game is a thin layer on that core and gets its own page from the same build (for example `/SWVR/`, `/SWVR/mobile/`, `/SWVR/free/`).

Order, as the owner set it:

1. **Modular boats, in this game (SWVR), next.** The owner has a detailed technical plan from a separate chat and will bring it in as its own prompt. **Don't design or start this ahead of that prompt.** What is already agreed:
   - It is built here, in the current VR/desktop game, not in a branch-off.
   - Saved boat designs must be usable later in the procedural world (see 3). The saved design file is the one place the two meet, so keep it independent of the world.
2. **Mobile / touchscreen version (later; wait for the owner).**
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
- `hull.ts`: the hull definition, standing on today's vessel definition until M6.
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
