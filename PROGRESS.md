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
  - **FM radio:** power switch, TUNE button (steps through the stations), and a display. It plays internet radio streams in a plain `<audio>` element (no CORS needed). The volume comes from the FM setting and fades with distance from the set (full within 3 m, silent at 16 m, and not streamed out of earshot). The tuned station is shared vessel state; each player's browser streams it. The display shows TUNING… or NO SIGNAL. The station list is in `CONFIG.fmRadio`: SomaFM Groove Salad and Secret Agent, Radio Paradise, Radio Swiss Jazz and Classic, Deutschlandfunk. The frequencies are made up. These streams could not be tested from the build machine (no internet there).
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

- **Landing survivors** (`rescue.ts`, shared simulation): once everyone is recovered, survivors sit aboard until she is **moored alongside any quay** (DOCK) or **anchored at an anchorage** (the port's skiff takes them, landing them by the goods stack).
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
- The game's world has the skiff floating off the workboat's starboard side (until S2 hangs it on the davit). Test worlds only get it when asked (`createWorld(..., { tender: true })`).
- **Tests (182):** skiff trials (speed, battery, turning, motions), drives / drains / steers, no battery no thrust, bumps off the workboat.

## Planned next (owner requests, not started)

1. ~~Fuel and oil temperature~~ **Done** (see above).
2. ~~VR menu~~ **Done**. New settings go in `ui/mainMenu.ts` via `MenuHost`.
3. **Missions and game loop.** On hold at the owner's request until asked for.

## Future roadmap (owner notes, not started)

3. ~~Archipelago with ports~~ **Done** (see above). Still open from the original notes:
   - ~~**Walking ashore**~~ **Done** (see above).
   - **Mooring lines:** not needed until there's wind or current to hold against.
   - **Breaking waves** on beaches.
4. **Dynamic weather.**
   - `EnvironmentState` already holds the sea state (wave components) and time of day. Add wind (speed, direction), visibility (fog density), cloud cover and rain intensity.
   - A slow weather simulation interpolates between weather presets, building and decaying the wave components, which are scaled from a target Hs and Tp. A JSONSWAP-style fit is possible later.
   - **Wind on the boat:** windage force and moment on the topsides and wheelhouse (projected areas from the layout).
   - **Visuals:** sky and fog palette darkened by cloud, rain particles (one draw call), whitecaps on the ocean shader.
   - Host-authoritative like the rest of the environment, so all players see the same weather.
5. **Map and charts.**
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

## Next

The MVP is done. Pick from "Planned next" and the "Future roadmap" above. Suggested order:

1. **Owner VR test** of fuel and temperatures, harbours, anchoring and refuelling. Then tune contact stiffness, the shelter factors and the menu size and placement.
2. **Weather** (wind, current), which gives the anchor and mooring lines something to do, plus mooring lines and walking ashore.
3. **Charts:** the world data already has coastlines, depths and ports.
4. **Missions** (rescue tasks), on hold until the owner asks. When they start, a mission is a small state machine in `WorldState` (plain data, stable ids) that reads world state each tick and emits events ("survivor spawned", "objective complete"). It never touches rendering.

For performance on the Quest, read the debug panel's cpu/gpu lines in VR:

- **FPS below 90 with low cpu:** the GPU is the limit. Lower `xr.framebufferScale` or raise `xr.foveation` in `config.ts`.
- **Headroom on both:** try `framebufferScale` 1.2 for sharper instruments.

## Known issues / notes

- **Water inside the hull:** the ocean is drawn wherever it is, so green water over the bulwark in big rolls can show "inside" the boat. Freeboard is 0.95–1.5 m, so it's rare in the current sea state. The fix is a hull-interior depth/stencil mask (see "Decision" above).
- **Collisions** are with the terrain, quays and piers only. The boat still passes through the buoys and the pilot-station platform near the start.
- **Fixed-size lights:** harbour lights are constant pixel size, so they don't grow as you approach.
- **Players can't walk ashore yet.** Boarding and leaving still go to the platform at the start.
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
