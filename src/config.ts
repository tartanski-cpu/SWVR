/**
 * Every tunable number in the game lives here, grouped by module.
 * Units are SI (metres, seconds, kilograms, radians) unless the name says otherwise.
 */
export type WeatherPresetName = 'Clear' | 'Overcast' | 'Fog' | 'Rain' | 'Squall';

// Towable hulls (CONFIG.vessels.derelict / logRaft / barge): displacement at the DWL (kg) and LCB (m aft).
const DERELICT_MASS = 2750;
const DERELICT_LCB = 1.29;
const LOGRAFT_MASS = 6400;
const LOGRAFT_LCB = 1.0;
const BARGE_MASS = 10500;
const BARGE_LCB = 1.39;

export const CONFIG = {
  sim: {
    /** Fixed simulation rate (Hz). Physics and intents are processed on this tick only. */
    tickRate: 60,
    /**
     * Upper bound on ticks run in one rendered frame. If the browser stalls (tab hidden,
     * GC pause) we drop the backlog instead of trying to catch up ("spiral of death").
     */
    maxTicksPerFrame: 5,
  },

  render: {
    antialias: true,
    maxPixelRatio: 2,
    fovDeg: 70,
    near: 0.05,
    far: 4000,
  },

  xr: {
    /** 1.0 = the headset's recommended resolution. Lower to buy frame time. */
    framebufferScale: 1.0,
    /** Fixed foveated rendering, 0 (off) .. 1 (max). Quest 3 copes well with ~0.5. */
    foveation: 0.5,
    /** Requested refresh rate if the headset supports it (Quest 3: 72 / 90 / 120). */
    targetFrameRate: 90,
  },

  environment: {
    /** Hours, 0..24. */
    startTimeOfDay: 10.5,
    /** Game-hours per real second. 0 = frozen sun. */
    timeScale: 0,
    /** Sea (and air) temperature (°C): a cold engine starts here, the cooler rejects heat to it. */
    seaTempC: 14,
    /** Hours added per keypress of N / M (debug). */
    timeStepHours: 0.5,
    /** Observer latitude and solar declination drive the sun path (degrees). */
    latitudeDeg: 50,
    solarDeclinationDeg: 12,
    fogNear: 200,
    fogFar: 2600,
    /** Radius (m) of the sky dome; must be inside the camera far plane. */
    skyRadius: 3500,
  },

  ocean: {
    gravity: 9.81,
    /** Sea water density (kg/m^3). */
    density: 1025,
    /**
     * Wave components summed as Gerstner (trochoidal) waves. Tuned by eye for a moderate
     * wind sea: Hs ~1.2 m (4*sigma of the sum), periods 2-7 s, waves travelling
     * towards the NE (coming from the SW) with +-35 deg directional spread.
     *
     *   amplitude    m, crest height above mean level (A); Hs = 4*sqrt(sum(A^2)/2)
     *   period       s; wavelength and celerity follow from deep-water dispersion w^2 = g*k
     *   directionDeg compass bearing the wave travels TOWARDS (0 = north = -Z, 90 = east = +X)
     *   steepness    Q in 0..1: horizontal orbital amplitude as a fraction of A. Q = 1 is the
     *                true deep-water circular orbit; sum(Q*k*A) must stay < 1 or crests loop.
     *   phase        rad, fixed offset so components don't all peak together
     */
    waves: [
      { amplitude: 0.25, period: 7.0, directionDeg: 45, steepness: 1.0, phase: 0.0 },
      { amplitude: 0.23, period: 6.0, directionDeg: 25, steepness: 1.0, phase: 1.7 },
      { amplitude: 0.17, period: 5.2, directionDeg: 65, steepness: 1.0, phase: 4.1 },
      { amplitude: 0.13, period: 4.3, directionDeg: 35, steepness: 1.0, phase: 2.6 },
      { amplitude: 0.1, period: 3.6, directionDeg: 80, steepness: 1.0, phase: 5.3 },
      { amplitude: 0.08, period: 3.0, directionDeg: 10, steepness: 1.0, phase: 0.9 },
      { amplitude: 0.055, period: 2.4, directionDeg: 55, steepness: 1.0, phase: 3.8 },
      { amplitude: 0.035, period: 2.0, directionDeg: 30, steepness: 1.0, phase: 2.2 },
    ],
    /**
     * Sea states: the waves above are "Moderate" (scale 1). Other states scale them:
     * amplitudes × s, periods × s^seaPeriodExponent. Exponent 0.5 would be pure Froude
     * scaling (constant steepness, a storm just a bigger copy of a moderate sea - accurate
     * for a fully developed swell but it looks the same from the boat); 0.3 makes a building
     * sea steeper as well as longer, like a young storm sea (steepness ∝ s^0.4; the Gerstner
     * crest-loop factor Σ Q·k·A goes 0.24 -> 0.35 at Storm, safely < 1). Hs ≈ 1.25 m × s.
     * Measured on the workboat beam-on: Moderate rolls ~16° and heaves 1.5 m, Rough 25° /
     * 2.8 m, Storm 31° / 4 m.
     */
    seaPeriodExponent: 0.3,
    seaStates: [
      { name: 'Calm', scale: 0 },
      { name: 'Slight', scale: 0.5 },
      { name: 'Moderate', scale: 1 },
      { name: 'Rough', scale: 1.8 },
      { name: 'Storm', scale: 2.6 },
    ],
    /** Largest sea scale the fine control allows, and its step. */
    maxSeaScale: 3,
    seaScaleStep: 0.1,
    mesh: {
      /** Grid spacing (m) in the dense centre around the viewer. */
      innerSpacing: 1.0,
      /** Half-width (m) of the uniformly dense centre. */
      innerHalfExtent: 32,
      /** Each cell beyond the centre is this much larger than the previous one. */
      growth: 1.08,
      /** Half-width (m) of the whole ocean tile. Must exceed fogFar so the edge is hidden. */
      radius: 3000,
      /**
       * A wave is faded out (visually only) where the grid becomes too coarse to draw it:
       * where cell size exceeds wavelength / this many cells.
       */
      minCellsPerWavelength: 4,
    },
    colors: {
      deep: 0x0b3550,
      scatter: 0x1f7a80,
      foam: 0xd8e4e8,
    },
    /** Sun glint sharpness (Blinn-Phong exponent). */
    specularPower: 220,
    /** Scales the Fresnel sky reflection (1 = physical). Lower = more water colour. */
    reflectionStrength: 0.75,
    /**
     * Fine wind ripples on top of the waves (surface detail only: they tilt the shading
     * normal, they don't move the water or the boat). Without them a calm sea is one flat
     * colour: no texture for the eye, hard to judge distance in VR. Two layers of the same
     * tiling pattern at different scales drift across each other. `strength`: slope added
     * to the normal; faded out between `fadeNear` and `fadeFar` (m) where they'd only
     * sparkle. `calmBoost`: extra strength in a flat calm (scaled down as the waves grow).
     */
    ripples: {
      strength: 0.13,
      calmBoost: 0.06,
      layers: [
        { scale: 9, speed: 0.35, directionDeg: 50 },
        { scale: 3.1, speed: 0.22, directionDeg: 125 },
      ],
      fadeNear: 30,
      fadeFar: 260,
    },
  },

  vessels: {
    /**
     * 12 m hard-chine displacement workboat. Axes: +X starboard, +Y up, -Z forward;
     * origin on the centreline, amidships, at the design waterline (DWL).
     * Hydrostatics of this hull at DWL (computed from the stations, see tests/vessel.test.ts):
     *   displacement 17.9 m^3 = 18.3 t, LCB 2.26 m aft of amidships, KB 0.62 m,
     *   GM ~1.31 m with VCG at +0.45 (KG 1.40 m), GZ max ~0.58 m at 40 deg.
     * Deck 4.6 m wide with the parallel body carried to 62 % of the length, so the side
     * decks stay ~0.75 m wide all along the wheelhouse (walk-around space, owner request);
     * the chine (and so the waterline) is unchanged: the extra width is flare.
     */
    workboat: {
      hull: {
        length: 12.0,
        beamDeck: 4.6,
        beamChine: 3.7,
        keelY: -0.95,
        chineYAft: -0.4,
        chineYBow: 0.5,
        deckYAft: 0.95,
        deckYBow: 1.5,
        stations: 17,
        deckParallel: 0.62,
      },
      /** kg. Chosen to float at the DWL. */
      mass: 18300,
      /** Centre of gravity (m, vessel axes). z = LCB so she floats level. */
      cg: [0, 0.45, 2.25] as [number, number, number],
      /** Radii of gyration (m): roll ~0.4 B, pitch and yaw ~0.25-0.27 L. */
      gyradius: { roll: 1.8, pitch: 3.0, yaw: 3.2 },
      /**
       * Frequency-independent added mass / added inertia as a fraction of the rigid-body
       * value, applied in proportion to how much of the hull is immersed. Slows the
       * motions to a realistic pace without changing the equilibrium.
       */
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      damping: {
        /**
         * Vertical damping per m^2 of waterplane (N*s/m per m^2), applied on the centreline
         * of every station against velocity relative to the water particles.
         * Gives heave and pitch damping (~20 % of critical in heave; raised from 800, ~13 %,
         * owner feedback: too bouncy for the crew watching on desktop).
         */
        vertical: 1300,
        /**
         * Quadratic vertical drag coefficient on each station's waterplane strip. Stands in
         * for slamming / water-entry losses so a hard landing doesn't bounce elastically.
         */
        verticalCd: 1.5,
        /**
         * Lateral force per station on its draft x spacing area: linear settling term
         * (N*s/m per m^2), hull lift slope (per rad, force = 0.5*rho*a*A*U*v) and crossflow Cd.
         */
        lateralLinear: 400,
        lateralLift: 1.2,
        lateralCd: 1.0,
        /** Small linear surge damping per station section area (N*s/m per m^2), only to
         *  settle residual creep; calm-water resistance is the `resistance` curve below. */
        surgeLinear: 20,
        /**
         * Angular damping (N*m*s/rad). Roll: ~30 % of critical in the free-decay trial
         * (critical = 2*sqrt(Delta*g*GM * I_roll) ~ 233 kN*m*s for this hull): a hard-chine
         * hull with deep bilge keels / a gentle roll-damping system. Raised from 24000
         * (~11 %) and 33000 (~15 %) on owner feedback (motion sickness); pitch likewise.
         */
        roll: 70000,
        pitch: 40000,
        yaw: 20000,
      },
      /**
       * Calm-water resistance R(V) = R_friction + R_wave, applied at mid-draft at the LCB.
       *   R_friction = 0.5*rho*S*V^2 * C_F(Re) * (1 + k),  C_F = ITTC-57 line
       *   R_wave     = Delta*g * cap * tanh(w / cap),  w = waveA*Fn^4 + waveB*max(0, Fn - waveKnee)^2
       * w is the steep rise past Fn ~0.35 toward hull speed; the tanh levels it off at
       * R_wave/Delta = `waveCap` over the hump (Fn ~0.5+), as for a transom-sterned workboat
       * hull that can be driven past hull speed with enough power (no planing lift modelled:
       * still a displacement boat). Below ~9 kn it is within ~8 % of the plain curve.
       * Owner request: top speed ~13 kn (Fn ~0.64). S (wetted surface) is computed from the
       * hull stations at the DWL.
       */
      resistance: {
        lwl: 11.0,
        formFactor: 0.2,
        waveA: 1.0,
        waveB: 0.94,
        waveKnee: 0.3,
        waveCap: 0.115,
        /** Going astern (transom first) is less efficient. */
        asternFactor: 3.6,
        /** Height (vessel y) at which resistance acts (~ mid-draft). */
        y: -0.45,
      },
      /**
       * Single slow-revving heavy-duty inboard diesel through a reverse/reduction gearbox to
       * one large fixed-pitch propeller. The shaft is a torque balance, not an RPM target:
       *   (I_engine + I_prop / i^2) * dw/dt = rack * Q_max(rpm) - Q_friction - Q_prop / (i * eta)
       * with an all-speed droop governor setting the fuel rack. Under heavy prop load
       * (bollard, towing, crash stop) RPM sags and the engine digs in.
       */
      engine: {
        /** Rated power (kW) at rated RPM - for reference; the torque curve is what's used. */
        powerKw: 400,
        idleRpm: 600,
        ratedRpm: 1800,
        /**
         * Full-load torque curve (rpm, N*m): heavy-duty 6-cyl, ~25 % torque rise, cut-out at
         * 1950. Uprated from 200 to 400 kW for ~13 kn (owner request).
         */
        torqueCurve: [
          [0, 0],
          [300, 1000],
          [600, 1700],
          [1000, 2500],
          [1300, 2640],
          [1600, 2420],
          [1800, 2122],
          [1900, 1200],
          [1950, 0],
        ] as [number, number][],
        /** Internal friction torque: a + b*rpm (N*m). */
        frictionTorque: 100,
        frictionPerRpm: 0.08,
        /** Rotating inertia at the crankshaft, engine + flywheel + gearbox (kg*m^2). */
        inertia: 4.5,
        /** Governor droop: full rack this many RPM below the set speed. */
        droopRpm: 120,
        /** Turbo / smoke limiter: fuel rack may rise at most this much per second. */
        rackRiseRate: 0.45,
        /** Starter motor torque (N*m) up to its maximum speed, and cranking time before firing. */
        starterTorque: 700,
        starterMaxRpm: 160,
        crankTime: 1.6,
        /** The engine will only start with the lever in neutral (like a real neutral-safety switch). */
        startOnlyInNeutral: true,
        /**
         * Ignition (diesel): key ON, hold HEAT until the glow lamp goes out, then hold START.
         * The preheat needed is `preheatTime` stone cold (coolant at sea temperature),
         * falling to `preheatHotTime` once the coolant is at `coldBelowC` and above (a warm
         * engine barely needs it). Unheated, a cold engine needs up to `unheatedExtraCrank`
         * more seconds of cranking to catch. Glow plugs cool again at `glowCoolRate` (s of
         * preheat lost per s).
         */
        preheatTime: 2.5,
        preheatHotTime: 0.6,
        unheatedExtraCrank: 5,
        coldBelowC: 40,
        glowCoolRate: 0.25,
        gearRatio: 3.0,
        gearEfficiency: 0.97,
        /** Clutch: lever must sit in the new direction this long, near idle, before it engages (s). */
        shiftDelay: 0.6,
        /** Lever travel either side of centre that counts as neutral (detent). */
        neutralBand: 0.08,
        /**
         * Fuel. The rack sets fuel per stroke and strokes per second follow RPM, so fuel flow
         * follows indicated power:  m_dot = sfc(rack) * rack * Q_max(rpm) * omega,
         * sfc(rack) = sfc * (1 + partLoadPenalty * (1 - rack)^2)  (worse at light load).
         * At full ahead (~13 kn) that is ~83 L/h; at idle ~1.8 L/h.
         */
        fuel: {
          tankL: 900,
          /** Fuel aboard at the start (L). */
          startL: 630,
          /** Specific fuel consumption at full rack, on indicated power (g/kWh). */
          sfcGPerKWh: 205,
          partLoadPenalty: 0.3,
          densityKgPerL: 0.84,
          /** Low-fuel warning below this fraction of the tank. */
          lowFraction: 0.1,
          /** Fuel berth delivery rate (L/s). */
          refuelRateLps: 2.5,
        },
        /**
         * Cooling and temperatures. One lumped heat capacity (block + coolant):
         *   C dT/dt = Q_in - UA (T - T_sea)
         *   Q_in = heatToCoolant * fuel energy rate (m_dot * LHV)
         *   UA   = baseLoss + exchanger * thermostat opening (0 at openC .. 1 at fullC),
         *          the exchanger only working while the engine-driven raw-water pump turns.
         * Oil follows the coolant with a lag, running hotter under load.
         */
        thermal: {
          heatToCoolant: 0.3,
          lhvMJPerKg: 42.7,
          /** kJ/K; about half a real engine's, so warming up takes minutes rather than half an hour. */
          heatCapacity: 150,
          thermostatOpenC: 80,
          thermostatFullC: 88,
          /** Sea-water heat exchanger conductance, thermostat fully open (kW/K). */
          exchangerKwPerK: 4.4,
          /** Losses with the thermostat shut or the engine stopped (kW/K). */
          baseLossKwPerK: 0.03,
          /** A failed raw-water pump impeller leaves this fraction of the exchanger working. */
          faultExchangerFraction: 0.08,
          /** High-temperature alarm (°C). */
          alarmC: 95,
          /** Governor derates the rack linearly to `derateRack` between these (°C)... */
          derateStartC: 100,
          derateFullC: 110,
          derateRack: 0.3,
          /** ...and the engine protection stops it above this (°C). */
          shutdownC: 115,
          /** Oil temperature lag behind the coolant (s) and extra rise at full load (°C). */
          oilLagS: 90,
          oilLoadRiseC: 12,
        },
      },
      propeller: {
        /** Large, slow, four-blade workboat propeller (m). Tip just below the keel line. */
        diameter: 1.05,
        /**
         * Linearised open-water coefficients, J = Va / (n*D), pitch ratio ~1.15 (matched so
         * the 400 kW engine just reaches rated RPM at ~13 kn, J ~0.52; open-water efficiency
         * ~0.55 there):
         *   K_T(J) = kt0 * (1 - J / j0)     thrust = K_T * rho * n^2 * D^4
         *   K_Q(J) = kq0 * (1 - J / jq0)    torque = K_Q * rho * n^2 * D^5
         */
        kt0: 0.57,
        j0: 1.15,
        kq0: 0.077,
        jq0: 1.25,
        /** Astern: thrust and torque as fractions of the ahead values (blades work backwards). */
        asternEfficiency: 0.5,
        asternTorque: 0.9,
        /** Prop + shaft rotating inertia at the propeller (kg*m^2). */
        inertia: 4.5,
        /** Taylor wake fraction w and thrust deduction t (bigger, slower prop: a bit higher). */
        wake: 0.18,
        thrustDeduction: 0.18,
        /** Shaft line position (vessel axes, m). */
        position: [0, -0.5, 4.9] as [number, number, number],
        /**
         * Prop walk: a right-handed prop (turns clockwise seen from astern when going ahead)
         * walks the stern to starboard ahead and, much more strongly, to PORT going astern.
         * Side force = fraction of thrust at the prop, fading out with speed through water.
         */
        rightHanded: true,
        propWalkAhead: 0.03,
        propWalkAstern: 0.12,
        /** Speed (m/s) at which prop walk has dropped to half. */
        propWalkFadeSpeed: 1.5,
      },
      rudder: {
        /** Sized to the big prop: ~1.05 m span x 0.6 m chord, mostly in the slipstream. */
        area: 0.62,
        /** Normal-force slope dC_N/dalpha (per rad) for a low aspect-ratio spade rudder, and stall angle. */
        liftSlope: 2.4,
        stallDeg: 28,
        maxAngleDeg: 35,
        /**
         * Steering gear rate (deg/s) for hydraulic steering, or null for direct mechanical
         * steering (cable / chain from the wheel, as on a boat this size: owner feedback) -
         * the rudder is wherever the wheel puts it, no lag.
         */
        rateDegPerS: null as number | null,
        /** Fraction of the propeller's slipstream momentum increase seen at the rudder. */
        washFactor: 0.8,
        /** Cap on the slipstream's extra rudder force, as a fraction of propeller thrust. */
        washMaxFraction: 0.55,
        /** Hull flow straightening of the lateral inflow at the rudder (0..1). */
        flowStraightening: 0.5,
        /**
         * Extra rudder force from the flow past the hull (the skeg and deadwood ahead of the
         * rudder work with it): the steerage she keeps with no power on, coasting. Raised
         * from 1 (owner feedback: more steerage with the engine in neutral). It fades out as
         * propeller thrust builds to `coastFadeThrust` (N), so steering under power (the
         * turning circle) is as before.
         */
        coastSteer: 1.5,
        coastFadeThrust: 8000,
        position: [0, -0.55, 5.65] as [number, number, number],
      },
      /**
       * Deck layout (vessel axes, m). The wheelhouse is a box from `front` to `aft` with
       * walls of thickness `wall`, an aft doorway and a window band all round. These numbers
       * drive both the visible geometry and the walkable area, so they can't disagree.
       */
      layout: {
        wheelhouse: {
          halfWidth: 1.45,
          front: -1.9,
          aft: 1.5,
          /** Interior floor height; must be above the deck under the house (deck sheer). */
          floorY: 1.2,
          roofY: 3.35,
          wall: 0.08,
          doorWidth: 0.8,
          doorHeight: 2.0,
          /** Window band, heights above the wheelhouse floor. */
          windowSill: 0.75,
          windowHead: 1.95,
          /** Helm console across the front of the house. */
          consoleDepth: 0.5,
          consoleHeight: 0.95,
        },
        /** Wheelhouse roof: walkable, with a rail around it (opening at the ladder head). */
        roof: { thickness: 0.12, overhang: 0.1, railHeight: 0.9, edgeMargin: 0.3 },
        /**
         * Vertical ladder up the aft face of the wheelhouse, starboard of the door: centre x,
         * width, and how far aft of the wall the climbing zone reaches.
         */
        ladder: { x: 0.92, width: 0.5, depth: 0.5 },
        /** Bulwark and rail heights above the deck, and how close a player may get to the deck edge. */
        bulwarkHeight: 0.3,
        railHeight: 1.0,
        deckEdgeMargin: 0.3,
        /** Player body radius used for collision with walls. */
        bodyRadius: 0.22,
      },
      /**
       * Bridge controls and displays (vessel axes, m). The helm console top is at
       * floorY + consoleHeight = 2.15, its aft face at z = -1.32; the helmsman stands at
       * z ~ -0.75. Controls are data, so another vessel can lay out its own bridge.
       */
      bridge: {
        /** Wheel: centre, tilt of its plane back toward the helmsman, rim radius, turns lock-to-lock. */
        wheel: { position: [0, 2.32, -1.2] as [number, number, number], tiltDeg: 22, radius: 0.22, turnsLockToLock: 1.5 },
        /**
         * Combined throttle/gear lever, pivoting fore-aft. It stands on a small pedestal
         * jutting aft from the console (starboard of the wheel) so it falls to hand from the
         * helm position (owner feedback: on the console top it was too far forward in VR).
         * Pedestal: half-width (m) and its aft face (z); its top is level with the console.
         */
        lever: {
          position: [0.45, 2.16, -1.15] as [number, number, number],
          maxAngleDeg: 40,
          length: 0.2,
          pedestal: { halfWidth: 0.13, aft: -1.02 },
        },
        /**
         * Diesel ignition on the console, starboard of the lever: HEAT (glow plugs) and START
         * buttons (hold), the key, and a row of warning lamps (oil, charge, glow, neutral)
         * in front of them. A laminated start-up card lies by them (starboard end).
         */
        startButton: { position: [0.78, 2.16, -1.52] as [number, number, number] },
        heatButton: { position: [0.62, 2.16, -1.47] as [number, number, number] },
        keySwitch: { position: [0.98, 2.16, -1.5] as [number, number, number] },
        warningLamps: { position: [0.8, 2.165, -1.61] as [number, number, number], spacing: 0.085 },
        checklistCard: { position: [1.17, 2.175, -1.47] as [number, number, number], width: 0.19, height: 0.26 },
        hornButton: { position: [-0.42, 2.16, -1.52] as [number, number, number] },
        navLightsSwitch: { position: [-0.78, 2.16, -1.52] as [number, number, number] },
        /** Windlass: up = heave in / stowed, down = let go. */
        anchorSwitch: { position: [-0.6, 2.16, -1.52] as [number, number, number] },
        cabinLightSwitch: { position: [-0.96, 2.16, -1.52] as [number, number, number] },
        spotlightSwitch: { position: [-1.14, 2.16, -1.52] as [number, number, number] },
        /** Windscreen wipers (Instruments breaker), at the port end of the row. */
        wipersSwitch: { position: [-1.3, 2.16, -1.52] as [number, number, number] },
        /**
         * Wheelhouse windows (glass in every opening when shut; quieter inside with the
         * door shut too), on the console between the horn and the wheel. The aft door is
         * opened and shut by hand (controls/WheelhouseDoor.ts).
         */
        windowsSwitch: { position: [-0.25, 2.16, -1.52] as [number, number, number] },
        /** Searchlight joystick on a pedestal to port of the wheel (mirrors the throttle's). */
        spotJoystick: { position: [-0.45, 2.16, -1.15] as [number, number, number] },
        /**
         * VHF radio hung close under the wheelhouse roof, out to port above the window head
         * (3.15 m) so it doesn't block the view (owner feedback), tilted down and turned
         * toward the helm (yaw: + turns its face toward starboard); its handset hangs on a
         * clip on its starboard side.
         */
        radio: { position: [-1.0, 3.2, -1.45] as [number, number, number], tiltDeg: 35, yawDeg: 35 },
        /** Chartplotter, the same out to starboard (rescue/cargo chart). */
        chart: { position: [0.98, 3.17, -1.45] as [number, number, number], tiltDeg: 35, yawDeg: -35 },
        /** DOCK / cast off (where the lever used to stand on the console top). */
        dockButton: { position: [0.45, 2.16, -1.52] as [number, number, number] },
        /** Instrument dash across the front of the console: displays on its aft face. */
        dash: { front: -1.82, aft: -1.66, bottom: 2.15, top: 2.56, halfWidth: 1.25, tiltDeg: 14 },
        /**
         * Display centres (x) on the dash, and their size (m). Order: speed, heading, rpm,
         * rudder, engine monitor (centre, behind the wheel - read through the spokes).
         */
        displays: { x: [-0.95, -0.52, 0.52, 0.95, 0], y: 2.36, width: 0.38, height: 0.22 },
        /**
         * NAV / WIND display (owner request: position and wind data): overhead on the
         * centreline, just forward of the overhead panel, tilted steeply down toward the helm:
         * a glance up from the wheel reads it, and it sits above the line of sight out of
         * the windscreen (which tops out at 3.15 m). Position (lat/lon), SOG, COG, heading,
         * true wind and an apparent-wind dial.
         */
        navDisplay: { position: [0, 3.2, -1.32] as [number, number, number], width: 0.44, height: 0.22, tiltDeg: 58 },
      },
      /**
       * Wet exhaust: smoke and engine cooling water leave through one outlet in the transom,
       * starboard side, just above the DWL, blowing aft (vessel axes; +z is aft).
       */
      exhaust: {
        position: [0.9, 0.22, 6.04] as [number, number, number],
        direction: [0, -0.12, 1] as [number, number, number],
      },
      /**
       * Swim ladder (owner request): hooked over the starboard bulwark on the aft deck, at
       * `z`, its foot `bottom` m below the waterline. From the water, grip any rung (VR) or
       * press jump within `range` m of it (desktop) to climb aboard at its head.
       */
      swimLadder: { z: 4.3, bottom: -0.9, width: 0.42, range: 2.0 },
      /** Navigation lights (vessel axes): masthead, sidelights, stern light. */
      navLights: {
        masthead: [0, 4.62, 0.33] as [number, number, number],
        port: [-1.52, 3.42, -1.75] as [number, number, number],
        starboard: [1.52, 3.42, -1.75] as [number, number, number],
        stern: [0, 2.0, 5.92] as [number, number, number],
      },
      /**
       * Anchor, chain and windlass. Chain tension at the bow (horizontal), with x the
       * horizontal distance bow -> anchor, h the bow height above the seabed, L the chain out:
       *   x < x_taut = sqrt(L² - h²):  T = w·h·exp((x - x_taut) / softness)   (catenary lifting)
       *   x ≥ x_taut:                  T = w·h + k·(x - x_taut) + c·dx/dt       (bar taut)
       * Above `holdingN` the anchor drags. Scope paid out: 4 × depth + 5 m.
       */
      anchor: {
        /** Bow roller / hawse (vessel axes). */
        hawse: [0, 1.35, -5.7] as [number, number, number],
        chainM: 60,
        /** 10 mm chain, weight in water (N/m). */
        chainWeightNPerM: 16,
        /** Holding power in sand/mud of a ~25 kg anchor (N). */
        holdingN: 20000,
        payOutRate: 2.0,
        heaveRate: 0.6,
        /** Windlass stalls above this pull (N). */
        windlassPullN: 9000,
        tautStiffness: 30000,
        tautDamping: 15000,
        catenarySoftness: 3,
      },
      /**
       * 12 V electrics (vessel/electrics.ts). Two batteries (start and house in a real boat;
       * here simply 1 and 2, picked by the selector), a battery master switch, and loads
       * that draw a fixed current while switched on. The alternator charges while the engine
       * runs. Resting voltage follows the charge (flat .. full); under load it sags by
       * I x R (cranking pulls it down hard), on charge it rises toward `chargeVolts`.
       * Below `cutoffSoc` a battery is flat: nothing works from it.
       */
      electrics: {
        batteryAh: 100,
        restVolts: [11.8, 12.7] as [number, number],
        internalOhm: 0.012,
        chargeVolts: 14.2,
        alternatorAmps: 60,
        cutoffSoc: 0.02,
        /** Current drawn while on (A). `base`: master on, the panel itself. */
        loads: {
          base: 0.4,
          instruments: 2.5,
          chart: 2.0,
          radio: 1.5,
          fm: 1.0,
          navLights: 2.0,
          deckFlood: 8,
          railLights: 1.0,
          cabinLight: 1.0,
          searchlight: 12,
          windlass: 60,
          horn: 10,
          bilge: 3,
          wipers: 4,
          chartLamp: 0.5,
          glowPlugs: 35,
          starter: 180,
        },
        /** Battery master (big red key) on the aft wall, starboard of the door, low down. */
        masterSwitch: { position: [0.8, 1.75, 1.41] as [number, number, number] },
        /** Battery selector (1 / BOTH / 2) beside it. */
        selectorSwitch: { position: [1.08, 1.75, 1.41] as [number, number, number] },
        /**
         * Quick start (casual sessions, desktop crew): the desktop E key / one press does it
         * all - master, the main breakers, key, preheat, start. Off: start her properly.
         */
        quickStart: false,
        /**
         * Leaving the battery master on in harbour drains the batteries between sessions
         * (`drainPerHour` of a full charge per hour away). Off by default; with it on, the
         * batteries' charge also carries over from the last session.
         */
        drainBetweenSessions: false,
        drainPerHour: 0.05,
        /**
         * Panel by the helm: a small sloping console against the starboard wall just under
         * the window sill (the side walls are windows above it), face tilted up toward you.
         * Voltmeter and the breakers (a toggle and an indicator lamp each).
         */
        panel: { position: [1.22, 1.84, -0.85] as [number, number, number], width: 0.54, height: 0.32, tiltDeg: 40 },
      },
      /**
       * Forepeak hatch on the foredeck (vessel axes: centre x/z, side length m). Left open
       * in rain, water gets below: the bilge fills (fraction/s at full rain, a squall's
       * spray counts double); the bilge pump (BILGE breaker, float switch) empties it at
       * `pumpRate`. The BILGE lamp lights above `alarmAt`. The game starts with it open,
       * airing the forepeak.
       */
      hatch: { position: [0, -3.3] as [number, number], size: 0.62, startOpen: true },
      /**
       * Fenders: three a side (vessel z), hung over the rail when out; stowed lying along
       * the bulwark. One press on the fender basket (aft deck, starboard) puts them all out
       * or takes them in.
       */
      fenders: { z: [-2.4, 0.6, 3.4], basket: [1.75, 2.4] as [number, number] },
      /**
       * Engine oil (vessel/maintenance.ts): level 0..1 when the session starts; burnt at
       * `use` per second running (more under load); a check is due every `checkEvery` s of
       * running. Below `lowAt` the dipstick says top up; below `lampAt` the OIL lamp
       * blinks. The engine hatch is in the wheelhouse floor, aft to starboard, with the
       * dipstick and an oil can by it ([x, z] on the floor).
       */
      maintenance: { oilStart: 0.72, use: 0.00025, checkEvery: 900, lowAt: 0.4, lampAt: 0.12, hatch: [0.62, 0.85] as [number, number], dipstick: [0.98, 0.7] as [number, number], oilCan: [1.05, 1.08] as [number, number] },
      bilge: { rainInflow: 1 / 400, pumpRate: 1 / 90, alarmAt: 0.3 },
      /**
       * Stern davit for the tender (the skiff), vessel axes. She hangs athwartships just aft
       * of the transom (`hang`: her origin; `yawDeg` 90 = her bow to port, outboard to
       * starboard), high enough that the transom stays clear for survivors coming aboard.
       * LAUNCH lowers her on the falls to `waterY` (her waterline level with ours) and lets
       * go; RECOVER (she must be within `recoverRange` of that spot, moving slower than
       * `recoverSpeed` relative to us) lines her up in `alignTime`, then hoists her.
       * Stowed, her battery charges from the ship (`chargeMinutes` from flat to full).
       */
      davit: {
        hang: [0, 2.3, 7.0] as [number, number, number],
        yawDeg: 90,
        waterY: 0.0,
        /** The two arms: posts on the quarters (x, base y, z), up to `topY`, reaching aft to `headZ`. */
        armX: 1.3,
        baseY: 1.0,
        baseZ: 5.8,
        topY: 3.45,
        headZ: 7.0,
        /** Lifting points on the skiff, her axes (she hangs from both ends). */
        liftZ: 1.3,
        lowerTime: 7,
        alignTime: 2.5,
        hoistTime: 7,
        recoverRange: 3.0,
        recoverSpeed: 1.2,
        chargeMinutes: 5,
        /** LAUNCH / RECOVER button on the starboard davit post, facing forward. */
        button: [1.3, 1.75, 5.72] as [number, number, number],
        /** Crew still in her when she's stowed step off here (on our aft deck). */
        stepOff: [0.6, 1.0, 4.9] as [number, number, number],
      },
      /**
       * Rescue gear (vessel axes): the life ring hangs on the aft face of the wheelhouse,
       * its line made fast to a cleat on the starboard quarter rail; the boat hook lies in
       * clips along the port bulwark (x, y, from z0 to z1). `stern` is the transom centre at
       * the waterline, where a survivor on the line comes aboard.
       */
      rescueGear: {
        ringStow: [-0.85, 2.3, 1.58] as [number, number, number],
        ringCleat: [0.95, 1.9, 5.7] as [number, number, number],
        hookStow: [-1.92, 1.55, 2.6, 5.0] as [number, number, number, number],
        stern: [0, 0.2, 6.05] as [number, number, number],
        /** Where survivors sit once aboard (vessel axes, on the aft deck). */
        seats: [
          [-0.9, 2.6],
          [0.9, 2.6],
          [0, 2.4],
        ] as [number, number][],
      },
      /**
       * Deck cargo. Items sit wherever they're put on the open deck; their masses and
       * positions go into the hull's mass, CG and inertia, so a load shifting to one side
       * gives her a list. Lashing points (D-rings, vessel axes, on the deck) along the aft
       * bulwarks and centreline: a crate within `lashRange` of one can be strapped down.
       */
      cargo: {
        maxPayloadKg: 5000,
        /** Item limit in cargo slots (see CONFIG.cargo.kinds); 0: no limit, only space and mass. */
        slots: 0,
        /** Deck kept clear of cargo at the narrow bow and at the transom (m from stem / transom). */
        bowClear: 1.5,
        aftClear: 0.25,
        /** Cargo stays where it's put (true), or slides about the deck in a seaway (false). */
        fixed: false,
        lashPoints: [
          [-1.95, 3.0], [-1.95, 4.2], [-1.95, 5.4],
          [1.95, 3.0], [1.95, 4.2], [1.95, 5.4],
          [0, 3.6], [0, 5.0],
        ] as [number, number][],
        lashRange: 1.1,
      },
      /**
       * Cabin light: a ceiling lamp in the wheelhouse (vessel axes) and its light (cd, m).
       * One real PointLight, hidden when off (no per-pixel cost; one shader recompile per switch).
       */
      cabinLight: { position: [0, 3.22, -0.2] as [number, number, number], intensity: 3, distance: 6 },
      /**
       * Overhead switch panel under the wheelhouse roof, just ahead of and above the helm
       * (well above the windscreen sightline): deck light switches and the FM radio.
       * Item x offsets along the panel (m) from its centre.
       */
      overheadPanel: {
        position: [0, 3.27, -1.05] as [number, number, number],
        width: 0.82,
        depth: 0.2,
        deckFore: -0.32,
        deckAft: -0.21,
        railLights: -0.1,
        fmDisplay: 0.11,
        fmPower: 0.27,
        fmTune: 0.36,
      },
      /**
       * Crew whiteboard (board/boardView.ts): inside the wheelhouse on the aft wall, port of
       * the door, facing forward (vessel axes: centre, width, height, m).
       */
      whiteboard: { position: [-0.9, 2.5, 1.4] as [number, number, number], width: 0.85, height: 0.62 },
      /**
       * Chart table along the port wall, aft half (vessel axes): its footprint (x0..x1
       * across, z0..z1 fore-aft) and top height above the wheelhouse floor. You stand on
       * its inboard side facing the wall (port), so north on the chart points to port.
       * On it: the paper chart, the logbook (open, at the aft end), a pen holder (pen,
       * pencil, eraser), dividers, and a lamp with its own switch
       * (Deck lights breaker). All positions are on the table top: [x, z].
       */
      // Pushed aft against the aft wall (owner feedback), under the whiteboard: more room
      // behind the helm.
      chartTable: {
        x0: -1.37,
        x1: -0.72,
        z0: 0.08,
        z1: 1.4,
        height: 0.95,
        book: { center: [-1.02, 1.12] as [number, number], width: 0.46, depth: 0.32 },
        holder: [-1.31, 0.74] as [number, number],
        lamp: { base: [-1.29, 0.88] as [number, number], height: 0.42 },
        lampSwitch: [-0.79, 1.33] as [number, number],
      },
      /**
       * The duty board (game tasks and the shipping forecast; duties/dutyBoardView.ts): on
       * the starboard wall in the aft half of the side window (behind the helm, where it
       * blocks the least of the view), facing inboard.
       */
      dutyBoard: { position: [1.355, 2.5, 0.78] as [number, number, number], width: 0.72, height: 0.54 },
      /**
       * Deck lights. Floods: a lamp on the wheelhouse roof edge aimed at a point on deck,
       * each ONE real SpotLight (cd, m, half-angle, penumbra), hidden when off (no per-pixel
       * cost; one shader recompile per switch). Rail lights: LED strips along the inside of the bulwark tops - glow
       * only, no real light (cheap on Quest).
       */
      deckLights: {
        fore: { position: [0, 3.36, -1.98] as [number, number, number], target: [0, 1.3, -3.9] as [number, number, number] },
        aft: { position: [0, 3.36, 1.58] as [number, number, number], target: [0, 1.0, 4.2] as [number, number, number] },
        intensity: 160,
        distance: 14,
        angleDeg: 60,
        penumbra: 0.6,
        railColor: 0xc4e8ff,
      },
      /**
       * Searchlight on the wheelhouse roof (vessel axes): beam (cd, m, half-angle deg,
       * penumbra 0..1), travel limits and joystick rates (deg/s at full deflection).
       */
      spotlight: {
        position: [0, 3.62, -1.55] as [number, number, number],
        intensity: 30000,
        distance: 300,
        angleDeg: 6,
        penumbra: 0.35,
        panLimitDeg: 170,
        tiltMinDeg: -35,
        tiltMaxDeg: 12,
        panRateDeg: 50,
        tiltRateDeg: 22,
      },
      /**
       * Fire monitor (fire missions, fire/fire.ts): a water cannon on the wheelhouse roof,
       * aft of the searchlight, fed by an engine-driven pump. In the wheelhouse: the FIRE
       * PUMP switch on the console (right of the wheel) and the monitor joystick on its own
       * pedestal starboard of the throttle (red knob): pan (+ to starboard) and elevation
       * at a rate, like the searchlight's. The jet leaves the nozzle at `nozzleSpeed` m/s
       * (`flowLpm` L/min) and flies a ballistic arc, slowed a little by the air
       * (`airDrag`, 1/s) and blown downwind (`windDrift` of the wind's speed); it only
       * flows with the pump on AND the engine running (no pressure otherwise).
       */
      fireMonitor: {
        position: [0, 3.75, -0.55] as [number, number, number],
        joystick: [0.85, 2.16, -1.15] as [number, number, number],
        pumpSwitch: [0.27, 2.16, -1.52] as [number, number, number],
        panLimitDeg: 170,
        tiltMinDeg: -10,
        tiltMaxDeg: 55,
        panRateDeg: 40,
        tiltRateDeg: 22,
        nozzleSpeed: 30,
        flowLpm: 2400,
        airDrag: 0.12,
        windDrift: 0.35,
      },
      /**
       * Docking (the DOCK button) and the mooring lines that hold her: bow and stern line
       * points (vessel axes, at the deck edge on the berth side are found automatically).
       */
      mooring: {
        lineZ: 4.5,
        lineY: 1.2,
      },
      /**
       * Windage for leeway (CONFIG.weather): projected areas above the water, side-on and
       * end-on (m2: hull topsides ~12 x 1.1 plus the wheelhouse ~3.4 x 2.2; 4.6 x 1.1 plus
       * 2.9 x 2.2 end-on), and the centre of effort (vessel axes).
       */
      /**
       * Windage for leeway: areas side-on and end-on (m2), and the centre of effort with
       * the wind on the beam (x, y; z as an offset from the hull's centre of lateral
       * resistance, + aft). See physics/windage.ts.
       */
      windage: { side: 21, front: 11, center: [0, 1.9, 0] as [number, number, number] },
      /** Where a player stands after boarding (vessel axes): at the helm, facing forward. */
      boardingSpot: [0, 1.2, -0.75] as [number, number, number],
      /** Debug: spawn/drop point and drop height (m above the DWL). */
      spawn: { x: 0, z: -22, dropHeight: 4, headingDeg: 90 },
    },

    /**
     * The workboat's tender: a 3.6 m flat-decked aluminium skiff (a punt with a low coaming)
     * with a small electric outboard. Same axes and physics as the workboat; no wheelhouse,
     * engine room, anchor or mooring - just a hull, a deck, an outboard and a tiller.
     * Mass chosen to float at the DWL (tests/seaTrials.test.ts).
     */
    skiff: {
      hull: {
        length: 3.6,
        beamDeck: 1.6,
        beamChine: 1.4,
        keelY: -0.14,
        chineYAft: -0.1,
        chineYBow: 0.1,
        deckYAft: 0.3,
        deckYBow: 0.42,
        stations: 9,
        deckParallel: 0.45,
      },
      /** Hull, decking, outboard and battery (kg). */
      mass: 330,
      /** z = LCB so she floats level. */
      cg: [0, 0.05, 0.76] as [number, number, number],
      gyradius: { roll: 0.55, pitch: 0.95, yaw: 1.0 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      /**
       * Same per-area coefficients as the workboat; the angular ones scaled to this boat's
       * critical damping (~1 kN*m*s in roll: 15 %).
       */
      damping: {
        vertical: 800,
        verticalCd: 1.5,
        lateralLinear: 400,
        lateralLift: 1.2,
        lateralCd: 1.0,
        surgeLinear: 20,
        roll: 150,
        pitch: 120,
        yaw: 120,
      },
      resistance: {
        lwl: 3.3,
        formFactor: 0.2,
        waveA: 1.0,
        waveB: 0.94,
        waveKnee: 0.3,
        waveCap: 0.115,
        asternFactor: 2.0,
        y: -0.05,
      },
      /**
       * Electric outboard on the transom: thrust at the propeller (vessel axes), falling
       * linearly from `staticThrustN` at rest to zero at `zeroThrustSpeed` (m/s, ~the
       * propeller's pitch speed); astern a fraction of that. Steered by swinging the whole
       * motor on its tiller (thrust direction), up to `maxSteerDeg`. Draws up to `powerKw`
       * from a `batteryKWh` battery, ~ |throttle|^1.5 (most of it near full).
       */
      outboard: {
        position: [0, -0.32, 1.95] as [number, number, number],
        staticThrustN: 750,
        zeroThrustSpeed: 5.5,
        asternFactor: 0.55,
        powerKw: 3,
        batteryKWh: 2,
        maxSteerDeg: 30,
        /** Tiller: pivot on top of the motor, handle length forward over the transom (m). */
        tiller: { pivot: [0, 0.55, 1.85] as [number, number, number], length: 0.55 },
      },
      layout: {
        bulwarkHeight: 0.15,
        railHeight: 0,
        deckEdgeMargin: 0.12,
        bodyRadius: 0.22,
      },
      /**
       * Cargo: two crates, or one drum (`slots`, CONFIG.cargo.kinds), in her bottom between
       * the bow and the helmsman's place by the tiller. Sitting low, wedged in, it doesn't
       * slide about (`fixed`), and she has no D-rings.
       */
      cargo: {
        maxPayloadKg: 250,
        slots: 2,
        bowClear: 0.6,
        aftClear: 0.9,
        fixed: true,
        lashPoints: [] as [number, number][],
        lashRange: 0.8,
      },
      /** Windage (see the workboat's): low sides plus whoever is aboard. */
      windage: { side: 2.4, front: 1.2, center: [0, 0.6, 0] as [number, number, number] },
      /** Where a player stands after boarding: by the tiller, facing forward. */
      boardingSpot: [0, 0.3, 1.1] as [number, number, number],
      /** Starts floating off the workboat's starboard side (she starts heading east at z -22). */
      spawn: { x: 0, z: -15, dropHeight: 0.3, headingDeg: 90 },
    },

    /**
     * Things to tow (towing missions, tow/tow.ts): no engine, no controls, the same boat
     * physics as everything else. Masses are what their hulls displace at the DWL and the
     * CG is over the LCB, so they float level (tests/tow.test.ts checks). Angular damping
     * is scaled from the workboat's and the skiff's by mass x size^2.
     * `tow.look` picks the model drawn over the hull (tow/towLook.ts).
     */
    derelict: {
      tow: { look: 'derelict' as const, name: 'a motor cruiser with engine failure' },
      hull: { length: 7, beamDeck: 2.5, beamChine: 2.1, keelY: -0.45, chineYAft: -0.15, chineYBow: 0.15, deckYAft: 0.7, deckYBow: 1.0, stations: 11, deckParallel: 0.5 },
      mass: DERELICT_MASS,
      cg: [0, 0.25, DERELICT_LCB] as [number, number, number],
      gyradius: { roll: 0.9, pitch: 1.8, yaw: 1.9 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      damping: { vertical: 800, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 20, roll: 2000, pitch: 2500, yaw: 2500 },
      resistance: { lwl: 6.5, formFactor: 0.25, waveA: 1.5, waveB: 1.2, waveKnee: 0.28, waveCap: 0.15, asternFactor: 2.0, y: -0.2 },
      layout: { bulwarkHeight: 0.25, railHeight: 0, deckEdgeMargin: 0.15, bodyRadius: 0.22 },
      cargo: { maxPayloadKg: 0, slots: 0, bowClear: 0.6, aftClear: 0.6, fixed: true, lashPoints: [] as [number, number][], lashRange: 0.8 },
      windage: { side: 9, front: 4, center: [0, 1.1, 0] as [number, number, number] },
      boardingSpot: [0, 0.75, 2] as [number, number, number],
      spawn: { x: 0, z: 0, dropHeight: 0.2, headingDeg: 0 },
    },
    logRaft: {
      tow: { look: 'logs' as const, name: 'a raft of logs broken loose from a timber tow' },
      hull: { length: 8, beamDeck: 3.0, beamChine: 2.9, keelY: -0.45, chineYAft: -0.3, chineYBow: -0.15, deckYAft: 0.2, deckYBow: 0.3, stations: 11, deckParallel: 0.85 },
      mass: LOGRAFT_MASS,
      cg: [0, -0.1, LOGRAFT_LCB] as [number, number, number],
      gyradius: { roll: 1.0, pitch: 2.2, yaw: 2.3 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      damping: { vertical: 800, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 20, roll: 7000, pitch: 7000, yaw: 7000 },
      resistance: { lwl: 7.8, formFactor: 0.8, waveA: 4, waveB: 3, waveKnee: 0.2, waveCap: 0.3, asternFactor: 1.5, y: -0.2 },
      layout: { bulwarkHeight: 0, railHeight: 0, deckEdgeMargin: 0.15, bodyRadius: 0.22 },
      cargo: { maxPayloadKg: 0, slots: 0, bowClear: 0.6, aftClear: 0.6, fixed: true, lashPoints: [] as [number, number][], lashRange: 0.8 },
      windage: { side: 2, front: 1.2, center: [0, 0.3, 0] as [number, number, number] },
      boardingSpot: [0, 0.3, 1] as [number, number, number],
      spawn: { x: 0, z: 0, dropHeight: 0.2, headingDeg: 0 },
    },
    barge: {
      tow: { look: 'barge' as const, name: 'a work barge adrift from her moorings' },
      hull: { length: 9, beamDeck: 3.6, beamChine: 3.4, keelY: -0.55, chineYAft: -0.45, chineYBow: -0.15, deckYAft: 0.5, deckYBow: 0.6, stations: 11, deckParallel: 0.85 },
      mass: BARGE_MASS,
      cg: [0, 0.1, BARGE_LCB] as [number, number, number],
      gyradius: { roll: 1.2, pitch: 2.5, yaw: 2.6 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      damping: { vertical: 800, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 20, roll: 10000, pitch: 10000, yaw: 10000 },
      resistance: { lwl: 8.7, formFactor: 0.6, waveA: 3, waveB: 2.5, waveKnee: 0.22, waveCap: 0.25, asternFactor: 1.5, y: -0.25 },
      layout: { bulwarkHeight: 0.1, railHeight: 0, deckEdgeMargin: 0.15, bodyRadius: 0.22 },
      cargo: { maxPayloadKg: 0, slots: 0, bowClear: 0.6, aftClear: 0.6, fixed: true, lashPoints: [] as [number, number][], lashRange: 0.8 },
      windage: { side: 5, front: 3, center: [0, 0.8, 0] as [number, number, number] },
      boardingSpot: [0, 0.55, 1] as [number, number, number],
      spawn: { x: 0, z: 0, dropHeight: 0.2, headingDeg: 0 },
    },
  },

  /**
   * Docking: inside a berth's hot spot (close, slow, roughly lined up either way round),
   * DOCK warps the boat in and the "lines" then hold her alongside. They are horizontal
   * spring-dampers at bow and stern towards the berth, so she still heaves and rolls.
   */
  docking: {
    /** Hot spot: boat origin within this distance of the berth (m)... */
    range: 18,
    /** ...below this speed (m/s)... */
    maxSpeed: 1.5,
    /** ...and within this angle of the berth axis, either way round (degrees). */
    maxAngleDeg: 40,
    /** Line stiffness and damping per end (N/m, N*s/m) once made fast. */
    stiffness: 9000,
    damping: 14000,
    /** Most a line pulls while warping in, and when moored (N); beyond `breakDist` m off, lines part. */
    warpForce: 7000,
    holdForce: 40000,
    breakDist: 8,
    /** Lines come taut over this long when docking (s). */
    warpTime: 4,
  },

  /**
   * Towing missions (tow/tow.ts). Out of harbour with nothing else on, every so often a
   * call comes: something adrift (a broken-down motor cruiser, a raft of logs, a work
   * barge) to bring into any port. Pick up the handset to take the job; hook its bow eye
   * with the boat hook (or the menu's Tow row) to make the towline fast to our towing post.
   *
   * The towline is one straight spring-damper between the towing post on our stern and
   * the tow's bow eye. It only pulls when taut (stretched past `lineLength`):
   *   T = k * stretch + c * (rate of stretch),  never negative (a rope can't push),
   * on the tow toward our stern and on us toward the tow, at those two points. c is set
   * for `dampingRatio` of critical on the two masses (so a heavy barge isn't springier
   * than a light cruiser). Snatching it (or dragging a tow over the rocks) above
   * `breakForce`, or stretching it past `maxStretch`, parts it.
   */
  tow: {
    /** Seconds between calls while she's out of harbour and free (first one too). */
    every: [240, 540] as [number, number],
    /** Relative odds of each kind (def ids). */
    weights: { derelict: 1, logRaft: 1, barge: 0.7 } as Record<string, number>,
    /** Where it's adrift: this far ahead (m), this far off to one side (m), in open water. */
    ahead: [450, 850] as [number, number],
    offset: [80, 260] as [number, number],
    minDepth: 6,
    minPortDistance: 400,
    /** An unanswered call goes away after this long (s); the alert repeats this often (s). */
    callTimeout: 120,
    callRepeat: 10,
    /** Towline: length (m), and the most the bow eye may be from our towing post to make it fast (m). */
    lineLength: 22,
    attachRange: 16,
    /** Line stiffness (N/m) and damping as a fraction of critical. */
    stiffness: 6000,
    dampingRatio: 0.5,
    /** It parts above this tension (N) or this stretch (m). */
    breakForce: 40000,
    maxStretch: 12,
    /** Delivered: the tow within this of a port (m), slower than this (m/s), for this long (s). */
    deliverRadius: 170,
    deliverSpeed: 0.8,
    deliverTime: 5,
    /** A delivered tow is taken over by the harbour (removed) this long after the hand-over (s). */
    removeAfter: 8,
    /** Towing post on our stern: height above the deck (m) and in from the transom (m). */
    postHeight: 0.6,
    postInset: 0.4,
    /** Debug "tow job alongside": this far astern of us (m). */
    debugDistance: 12,
  },

  /**
   * Fire missions (fire/fire.ts; the monitor itself is CONFIG.vessels.workboat.fireMonitor).
   * Out of harbour with no other job on, a fire is reported every so often: a fishing boat
   * burning at sea (`shoreChance` of the time a fire ashore instead, if a spot is found).
   * It starts at `startIntensity`, grows at `growth` per s to 1, and the jet knocks it down
   * at `douse` per s at full flow on target (net: about a minute's steady hosing from
   * full). Out below `outBelow`; the wreck smoulders `removeAfter` s. The jet hits within
   * `hitRadius` m of it, up to the flames' height (`flameHeight` x 0.4..1 with intensity).
   */
  fire: {
    every: [300, 660] as [number, number],
    shoreChance: 0.5,
    ahead: [400, 800] as [number, number],
    offset: [100, 300] as [number, number],
    minDepth: 6,
    minPortDistance: 350,
    /** Ashore: ground this high (m), with water `minDepth` deep within `shoreReach` m, within `shoreRange` m of us. */
    shoreHeight: [0.8, 6] as [number, number],
    shoreReach: 45,
    shoreRange: 1500,
    callTimeout: 120,
    callRepeat: 10,
    startIntensity: 0.6,
    growth: 0.004,
    douse: 0.02,
    outBelow: 0.03,
    removeAfter: 40,
    hitRadius: { boat: 5, shore: 6 } as Record<'boat' | 'shore', number>,
    flameHeight: { boat: 5, shore: 7 } as Record<'boat' | 'shore', number>,
    /** Debug "fire off the bow": this far ahead (m). */
    debugDistance: 45,
  },

  /** Port lighting: the shared floodlight for the nearest port at night. */
  portLights: {
    /** Floodlight intensity (cd) and reach (m); only on within `activeRange` m of the port. */
    floodIntensity: 1600,
    floodDistance: 70,
    activeRange: 500,
    /** Lamp glow colour (warm LED / sodium). */
    lampColor: 0xffd9a0,
  },

  /** Cargo between ports (cargo/cargo.ts). */
  cargo: {
    /** Each port keeps this many items waiting (a delivery spawns a replacement elsewhere). */
    perPort: 5,
    /** Counts as anchored in a port's bay only nearly stopped (m/s). */
    maxSpeed: 0.6,
    /** Set an item down ashore within this of its destination's goods stack to deliver it (m). */
    deliveryRadius: 12,
    /** Spacing of items waiting in a port's stack row (m). */
    stackSpacing: 0.9,
    /**
     * Kinds of cargo, all man-portable (carried by hand): name, mass (kg), size (m: across,
     * height, along) and shape. Above `twoHandKg` an item needs both hands. `slots`: room
     * it takes in a small boat with a slot limit (the skiff: two crates, or one drum).
     */
    kinds: [
      { name: 'Crate', mass: 40, size: [0.6, 0.45, 0.5] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Fish box', mass: 30, size: [0.8, 0.3, 0.5] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Sack', mass: 50, size: [0.55, 0.3, 0.85] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Gas bottle', mass: 70, size: [0.32, 1.1, 0.32] as [number, number, number], shape: 'drum' as const, slots: 1 },
      { name: 'Oil drum', mass: 110, size: [0.58, 0.88, 0.58] as [number, number, number], shape: 'drum' as const, slots: 2 },
    ],
    twoHandKg: 60,
    /**
     * Unlashed cargo on deck slides when the apparent gravity along the deck (heel, trim,
     * the deck's own accelerations in a seaway, slams) beats friction: wood/steel on a wet
     * steel deck, μ ≈ 0.35. Pressed against the bulwark by more than `overboardG` (in g)
     * along the deck, it goes over the rail.
     */
    friction: 0.35,
    overboardG: 0.55,
    /** Accelerations above this (g) are clipped: penalty-contact spikes aren't real. */
    maxDeckG: 3,
  },

  /**
   * Dynamic weather (environment/weather.ts). One state - wind, visibility, rain, cloud -
   * moving between presets by smooth transitions; the sea follows the wind with a lag.
   *   presets   wind (m/s), visibility (m), rain and cloud (0..1)
   *   next      which presets may follow which (never clear straight to squall), weights
   *   hold      how long a preset holds before the director moves on (s, real time),
   *             squalls are short (`squallHold`)
   *   transition  time constant (s) of the values easing toward a new preset
   *   seaPerWind  sea scale per m/s of wind (CONFIG.ocean.seaStates: 1 = moderate)
   *   seaBuild / seaDecay  time constants (s): the sea builds after the wind, and settles slower
   *   windDir  the wind comes FROM this bearing, wandering +-`windDirSpread`
   * Fog banks: patches of thick fog in the archipelago (x, z, radius m, visibility m).
   */
  weather: {
    startPreset: 'Clear' as WeatherPresetName,
    /** Fix the weather to the start preset for a session (no director). */
    fixed: false,
    presets: {
      Clear: { wind: 5, visibility: 20000, rain: 0, cloud: 0.1 },
      Overcast: { wind: 7, visibility: 9000, rain: 0, cloud: 0.85 },
      Fog: { wind: 2.5, visibility: 220, rain: 0, cloud: 0.6 },
      Rain: { wind: 10, visibility: 2500, rain: 0.6, cloud: 1 },
      Squall: { wind: 17, visibility: 900, rain: 1, cloud: 1 },
    },
    next: {
      Clear: { Clear: 2, Overcast: 3, Fog: 1 },
      Overcast: { Clear: 3, Rain: 2, Fog: 1 },
      Fog: { Clear: 2, Overcast: 2 },
      Rain: { Overcast: 3, Squall: 1 },
      Squall: { Rain: 1 },
    },
    hold: [240, 600] as [number, number],
    squallHold: [90, 150] as [number, number],
    transition: 60,
    seaPerWind: 0.12,
    seaBuild: 90,
    seaDecay: 160,
    windDir: 225,
    windDirSpread: 35,
    fogBanks: [
      // Around Gull Rocks (between the start and Calder Haven) and off the Skerry.
      { x: 380, z: 430, r: 260, visibility: 160 },
      { x: -470, z: -360, r: 230, visibility: 180 },
    ],
    /** Fog: scene fog runs from `nearFraction` x visibility to the visibility. */
    nearFraction: 0.12,
    /** Leeway: air density (kg/m3) and drag coefficient on the boats' windage (vessel `windage`). */
    airDensity: 1.225,
    windCd: 1.0,
    /**
     * How far the centre of effort moves toward the upwind end with the wind ahead or
     * astern (fraction of the length; a flat plate's centre of pressure is near its leading
     * quarter at a fine angle, mid-plate side-on). This is what turns a stopped boat
     * beam-on to the wind, as real ones lie.
     */
    windCeShift: 0.25,
    /** Things floating in the water drift downwind at this fraction of the wind speed. */
    driftPerWind: 0.02,
    /** The thrown life ring is pushed downwind in flight at this fraction of the wind (m/s^2 per m/s). */
    ringPushPerWind: 0.06,
    /** Rain darkens the light a little more than cloud alone (fraction at full rain). */
    rainDarken: 0.3,
    /**
     * Lightning in squalls: a flash every `every` s (random in the range), `dist` m away
     * (random); thunder follows at the speed of sound.
     */
    lightning: { every: [10, 30] as [number, number], dist: [500, 4000] as [number, number], flashTime: 0.35 },
    /**
     * Shipping forecast on the VHF: every `every` s, and `afterChange` s after the weather
     * turns (the plan for the next change is new). Received only with the radio on.
     */
    forecast: { every: 360, afterChange: 30 },
  },

  /**
   * Rain (view only): streaks in a box around the viewer, one draw call, animated in the
   * vertex shader - no per-frame CPU work. `count` at full rain on high quality, `lowCount`
   * on low; they don't fall inside the wheelhouse.
   */
  rain: {
    count: 1400,
    lowCount: 500,
    /** Box around the viewer (m): width/depth and height. */
    area: 16,
    height: 8,
    /** Fall speed (m/s) and streak length (m). */
    speed: 9,
    length: 0.45,
    opacity: 0.6,
    /** Window rain: drops build back up this long after a wipe at full rain (s); drop grid (m). */
    /**
     * In the headset, on "High": if frames take longer than `autoLowFrameMs` on average
     * over `autoLowSeconds` while it rains, drop to Low for the session (and say so).
     */
    autoLowFrameMs: 16.5,
    autoLowSeconds: 3,
    glassRefill: 3.5,
    glassCell: 0.022,
    /** Wipers: one sweep there and back (s), half-angle (deg), arm length (m). */
    wiperPeriod: 1.7,
    wiperSweepDeg: 42,
    wiperArm: 0.7,
  },

  /**
   * Spotting: the lookout calls out something in the water within this range (m) - or the
   * visibility, if less. A survivor's strobe shows through fog to `strobeVisFactor` x the
   * visibility; their arm waving is seen within the visibility.
   */
  spotting: { range: 900, strobeVisFactor: 1.6 },

  /** The duty board's game-generated task list (duties/duties.ts). */
  /**
   * Passing ships and hazards (traffic/traffic.ts). `maxShips` AI ships are kept about
   * (owner request: 4): while there are fewer, one is spawned every `every` s (random in the
   * range; the first `firstShip` s in) on a straight course that crosses ahead of the
   * workboat `pass` m off at its closest, starting `spawnDist` m away, its whole track in
   * deep water; it goes when it's `despawn` m off and moving away. In harbour too, as long
   * as such a track exists (debris only out of harbour). A "vessel sighted" log event
   * waits while an earlier one is unlogged, so they don't pile up. Ship types:
   * length, beam, speed (m/s), AIS names. Sighted within min(`sightRange`, visibility x
   * `sightVis`). In restricted visibility they sound a prolonged blast every 2 min, and
   * answer yours. Hazards: floating debris (spawned like ships, drifting), the rocks and
   * these buoys; passed within `hazardRange` m (and in sight) they're loggable.
   */
  traffic: {
    every: [20, 45] as [number, number],
    firstShip: 5,
    maxShips: 4,
    spawnDist: [1800, 2600] as [number, number],
    pass: [350, 900] as [number, number],
    despawn: 3600,
    sightRange: 2500,
    sightVis: 1.1,
    /** Shortest gap between two ship sightings put in the log (s). */
    sightEvery: 300,
    hornRange: 3000,
    ships: {
      cargo: { length: 82, beam: 13, speed: 6.5, names: ['Hebridean Trader', 'Lorne Carrier', 'Skerry Star'] },
      fishing: { length: 19, beam: 6, speed: 4, names: ['Morning Dew', 'Silver Harvest', 'Girl Isla'] },
      yacht: { length: 12, beam: 3.8, speed: 3, names: ['Kittiwake', 'Blue Moon', 'Saorsa'] },
    },
    debrisEvery: [300, 600] as [number, number],
    hazardRange: 200,
    rocks: [
      { name: 'Gull Rocks', x: 380, z: 430 },
      { name: 'Skerry', x: -470, z: -360 },
    ],
    /** Hazard marks (vessel-free buoys): position and colour. */
    buoys: [
      { x: 270, z: 430, color: 0xe8c020 },
      { x: -580, z: -360, color: 0xe8c020 },
      { x: 150, z: 980, color: 0xd0302a },
    ],
  },

  /**
   * The chart's grid (nav/geo.ts): the latitude and longitude of the world origin. The
   * archipelago is fictional; this just makes positions read like real ones.
   */
  nav: { originLat: 56.62, originLon: -5.95 },

  /**
   * The ship's log (log/log.ts). A voyage runs from a departure to an arrival; the last
   * `keepVoyages` are kept (in the browser). An event waits `eventLinger` s to be logged
   * (its duty drops off after that). A draft left untouched for `draftIdle` s can be taken
   * over by someone else. It's too dark to read the book below `readLight` daylight
   * (0..1) unless the chart table lamp is on.
   */
  /**
   * Pencil marks on the paper chart (chart/marks.ts). Strokes are stored in world metres
   * (so they line up with the map), points kept at least `minStepM` m of chart apart and
   * rounded to `quantM`. Over `maxPoints` in all, the oldest strokes go (the oldest ones
   * are drawn fainter as the cap nears, as if rubbed). Table side (m): the pencil touches
   * within `contactMm` of the paper; the eraser rubs out within `eraseRadius`. Hold the
   * eraser's trigger `clearHold` s to clear the chart. `showOnPlotter`: the crew's marks faintly on the chartplotter too.
   */
  chartMarks: {
    maxPoints: 4000,
    minStepM: 15,
    quantM: 0.5,
    contactMm: 6,
    eraseRadius: 0.012,
    clearHold: 2,
    sendEvery: 0.1,
    showOnPlotter: true,
  },

  log: { keepVoyages: 5, eventLinger: 300, draftIdle: 90, readLight: 0.35, harbourRadius: 300 },

  duties: {
    /** A finished duty stays up, ticked, this long (s), then drops off. */
    doneLinger: 15,
    /** Restricted visibility (COLREG rule 35): under way in visibility below `fogVis` (m)... */
    fogVis: 1000,
    /** ...until it clears above `fogClearVis`: a prolonged blast (>= `blastMin` s) every `blastEvery` s. */
    fogClearVis: 1500,
    blastMin: 4,
    blastEvery: 120,
    /** Heavy weather: a received forecast of rain or a squall counts for this long (s). */
    forecastValid: 900,
  },

  /** Water effects (all one draw call each; see vessel/view/wakeTrail.ts and spray.ts). */
  effects: {
    wake: {
      /** Ring-buffer size; with the spacing below this must cover `life` at full speed. */
      maxPoints: 220,
      /** A new trail point every this many metres travelled... */
      spacing: 1.2,
      /** ...or this often (s) while the prop churns with the boat (nearly) stopped. */
      idleInterval: 0.35,
      /** Seconds until the foam has gone. The prop wash in the middle fades sooner. */
      life: 26,
      washLife: 9,
      /** Half-width at the transom (m), and how fast the arms spread per m/s of speed (m/s). */
      startHalfWidth: 1.7,
      /** tan(19.47°) - the Kelvin wake half-angle - softened. */
      spreadPerSpeed: 0.3,
      maxSpread: 2.5,
      /** Speed (m/s) for full-strength arms, and thrust (N) for full-strength prop wash. */
      fullArmSpeed: 4,
      fullWashThrust: 25000,
    },
    spray: {
      maxParticles: 320,
      /** Bow wave "moustache": starts above this speed (m/s), particles/s per m/s above it. */
      bowSpeed: 2.2,
      bowRate: 18,
      /** A slam: the bow re-entering the water faster than this (m/s) throws spray. */
      slamSpeed: 1.0,
      /** Particles per m/s of slam speed above the threshold (each bow probe). */
      slamParticles: 14,
    },
  },

  /**
   * Hull contacts with the seabed, shore, quays and piers: penalty springs at points on the
   * keel, chines and deck edges (vessel physics). Per point: F_n = k·depth − c·v_n (pushing
   * only), friction ≤ μ·F_n opposing sliding. Fendered faces are softer and slippery.
   */
  contacts: {
    /** The values below are for a boat of this mass (the workboat); lighter ones scale them down. */
    referenceMass: 18300,
    stiffness: 4e5,
    damping: 3e4,
    friction: 0.45,
    fenderStiffness: 1.2e5,
    fenderDamping: 2.5e4,
    fenderFriction: 0.12,
    /** Below this sliding speed friction becomes viscous, so a grounded boat settles (m/s). */
    stickSpeed: 0.08,
  },

  /** Desktop debug driving with the arrow keys (in VR you use the bridge controls). */
  debugDriving: {
    /** Lever travel per second while the key is held (full range is -1..1). */
    leverRate: 0.6,
    /** Helm travel per second while the key is held (full range is -1..1). */
    helmRate: 0.8,
  },

  /** Player movement aboard and on the platform. */
  locomotion: {
    /**
     * Grab-the-world (grip + drag) is always on; smooth stick movement is optional.
     * This and snapTurnDeg are defaults: the VR menu changes them per device.
     */
    smoothEnabled: true,
    smoothSpeed: 1.4,
    /** Running (owner request): walking speed times this. VR: push the stick all the way; desktop: Shift. */
    runMultiplier: 2.4,
    snapTurnDeg: 30,
    /** Crouch (X in VR, C on the desktop): how far the view and hands drop (m), and how fast (s). */
    crouchDrop: 0.6,
    crouchTime: 0.12,
    /** Stick deflection that triggers a snap turn, and that must be released before the next. */
    snapThreshold: 0.7,
    /** Floor-height following time constant (s), smooths steps like the doorway sill. */
    floorSmoothing: 0.12,
  },

  /**
   * The player's body off the deck: walking ashore, jumping, swimming (player/body.ts).
   * Jumps start with the boat's own velocity at your feet, so leaping off a moving boat
   * carries you along with her, as it would.
   */
  body: {
    gravity: 9.81,
    /** Take-off speed up and along your view (m/s): ~0.55 m high, ~2 m long from standing. */
    jumpUp: 3.3,
    jumpForward: 2.4,
    /** Hitting a quay face with your feet this far below its top, you clamber up onto it (m). */
    clamberHeight: 0.8,
    /** You can stand where the ground is at most this deep under mean water (m). */
    wadeDepth: 1.0,
    /** Steepest terrain you can walk up: minimum ground-normal Y (0.55 ≈ 57°). */
    maxSlopeNormalY: 0.55,
    /** Swimming: stick speed (m/s), head height above the surface (m), surface-follow time constant (s). */
    swimSpeed: 0.8,
    swimHeadAbove: 0.15,
    swimSmoothing: 0.4,
    /** Climbing out: a gripping hand this close to the gunwale or transom hauls you aboard (m). */
    climbReach: 0.45,
    /** Jump / grip while swimming within this of the hull or a quay face climbs out (m). */
    climbOutRange: 1.3,
    /** Highest quay or pier deck above the water you can climb onto from the water (m). */
    quayClimbMax: 2.8,
  },

  /**
   * Rescues on cargo runs (rescue/rescue.ts; the kinds of rescue are in rescue/rescueDefs.ts).
   * A run is: cargo aboard bound for another port, and the boat out of harbour. Once per run
   * there's a `chance` of a call, somewhere between `triggerFraction` of the way along.
   */
  rescue: {
    chance: 0.5,
    /** Out of harbour: further than this from every port (m). */
    harbourRadius: 300,
    /** The call comes this fraction of the way from the departure port to the destination. */
    triggerFraction: [0.25, 0.65] as [number, number],
    /** The incident: this far ahead of the boat, toward the destination (m)... */
    ahead: [450, 800] as [number, number],
    /** ...and this far off to one side, so it's an easy diversion (m). */
    offset: [80, 220] as [number, number],
    /** Keep it in open water: at least this deep (m) and this far from any port (m). */
    minDepth: 5,
    minPortDistance: 350,
    /** An unanswered call goes away after this long (s), and repeats its alert this often (s). */
    callTimeout: 120,
    callRepeat: 10,
    /** Targets lie within this fraction of the search radius from its centre. */
    targetSpread: 0.6,
    /** Lost crates float in a loose group: this far apart (m). */
    crateSpacing: [4, 12] as [number, number],
    /**
     * Harder mode: the call gives the last known position as latitude/longitude only, and
     * the chartplotter doesn't show the search area - plot it on the paper chart yourself.
     */
    plotYourself: false,
    /** Slow drift of everything in the water (m/s, world x/z); there's no wind yet. */
    drift: [0.1, 0.06] as [number, number],
    /** Debug "spawn alongside": this far off the bow (m), within a life ring's throw. */
    debugSpawnDistance: 18,
    /** A survivor waves when you're within this (m), and blows the lifejacket whistle every few seconds within that (m, s). */
    waveRange: 300,
    whistleRange: 350,
    whistleEvery: 6,
    /**
     * Recovery. Life ring: thrown with the controller's release velocity x `throwScale`
     * (slower than `minThrowSpeed` puts it back); it lands within `catchRadius` of a survivor
     * and they grab it. The line pays out to `maxLine`; each hand pull reels in that distance
     * x `reelScale` (desktop: `desktopPull` per click; throws land where you look, at up to
     * `desktopThrowSpeed` m/s).
     */
    throwScale: 1.4,
    minThrowSpeed: 1.2,
    catchRadius: 2.5,
    maxLine: 30,
    reelScale: 1.6,
    desktopThrowSpeed: 17,
    desktopPull: 1.5,
    /** On the line within this of the stern (and in neutral), they climb aboard over `climbTime` s. */
    climbRange: 3,
    climbTime: 2.2,
    /** In gear with a survivor within this of the stern: they swim away from the propeller at this speed (m/s). */
    propRadius: 7,
    swimAway: 0.8,
    /** Boat hook: length (m), how close its tip must come to a crate to hook it, and how close
     *  alongside (from the hull side, m) a hooked crate must be to lift aboard. */
    hookLength: 2.2,
    hookReach: 0.6,
    /**
     * Auto-extend (menu option, on by default): pointed at a floating crate or a tow's bow
     * eye within this range (m), the hook telescopes out to it; it slides back to its own
     * length once something is on it, bringing it in. Telescoping speed (m/s) out and in.
     */
    hookAutoReach: 8,
    hookExtendSpeed: 10,
    hookRetractSpeed: 1.5,
    liftRange: 2.5,
    /**
     * Landing survivors (milestone 4): moored alongside any quay, or anchored at an
     * anchorage (the skiff takes them), they step off one every `landEvery` s, each taking
     * `landTime` s; they stand ashore `quayInset` m in from the quay edge, `ashoreSpacing`
     * apart, and wave for `ashoreTime` s before the rescue is closed.
     */
    landEvery: 1.4,
    landTime: 2.0,
    quayInset: 1.6,
    ashoreSpacing: 0.9,
    ashoreTime: 12,
    /** Night strobe on lifejacket and crates: flash period and length (s); shown when it's this dark (0..1). */
    strobePeriod: 1.0,
    strobeOn: 0.08,
    strobeDarkness: 0.25,
  },

  /**
   * FM radio in the wheelhouse: internet radio streams played by the browser (an <audio>
   * element, so no CORS needed). Every player aboard hears the station the set is tuned to,
   * each from their own connection. The frequencies are made up, for the display. Streams
   * must be https (the game is served over https). Heard fully within `fullRange` of the
   * set (m), fading to nothing at `range`.
   */
  fmRadio: {
    // Owner: pop and 90s, English-speaking, no German stations. Streams are plain HTTPS MP3
    // (played in an <audio> element, so no CORS needed); a dead one just shows NO SIGNAL.
    stations: [
      { freq: '88.6', name: 'TruckersFM', url: 'https://live.truckers.fm/' },
      { freq: '91.2', name: 'Heart 90s', url: 'https://media-ssl.musicradio.com/Heart90s' },
      { freq: '94.7', name: 'Absolute 90s (1.FM)', url: 'https://strm112.1.fm/90s_mobile_mp3' },
      { freq: '97.3', name: 'Heart', url: 'https://media-ssl.musicradio.com/HeartUK' },
      { freq: '101.5', name: 'Smooth', url: 'https://media-ssl.musicradio.com/SmoothUK' },
      { freq: '104.8', name: 'Radio Paradise', url: 'https://stream.radioparadise.com/mp3-128' },
    ],
    fullRange: 3,
    range: 16,
    /** Streams are mastered loud: their level at 100 % on the FM volume setting (owner: too loud). */
    gain: 0.2,
  },

  /**
   * Laser pointer (replaces pings, owner request): VR, hold the right stick in; desktop,
   * hold the right mouse button. Reach (m); what it hits is found `hitRate` times a second.
   * Desktop: the beam starts at a "hand" `deskHand` (m: right, up, forward of the eyes), so it's
   * seen from the side; started at the eyes it would be seen end-on, just a dot.
   */
  laser: { reach: 600, hitRate: 15, deskHand: [0.2, -0.25, -0.35] as [number, number, number] },

  comfort: {
    /**
     * Motion coupling between the deck and the player's view, 0..1 (BeamNG-style).
     *   1   = rigidly attached: you feel every roll, pitch and heave of the deck.
     *   0.x = a critically damped "neck and knees" spring between deck and view: slow,
     *         gross motion is followed, faster roll/pitch/heave is soaked up, like the
     *         human head-stabilisation reflexes do.
     *   0   = horizon level, height smoothed.
     * Heading and horizontal position always stay locked to the deck (walking/collision).
     * Adjust in VR: the menu (Y). Desktop: 9 / 0.
     */
    // Default rigid: in VR testing, decoupling also moved the hands relative to the deck
    // (they live in the same rig as the head), making the bridge controls hard to grab.
    motionCoupling: 1.0,
    /**
     * The same on the desktop (its own setting, keys 9 / 0): softer by default, since there
     * are no hands to keep on the controls and a screen that rolls with the deck makes
     * onlookers queasy (owner feedback).
     */
    desktopMotionCoupling: 0.3,
    /** Filter time constant at coupling 0 (s); shrinks to `minTimeConstant` at coupling 1. */
    maxTimeConstant: 1.6,
    minTimeConstant: 0.12,
    /** Time constant (s) of the very slow reference height that heave is measured from. */
    heaveReferenceTime: 8,
    /** Softly limits how far the view may move vertically relative to the deck (m). */
    maxHeaveOffset: 0.4,
    /** Tunnel vignette while artificially moving (0..1 strength). */
    vignette: 0.6,
  },

  /**
   * Binoculars (player/binoculars.ts): 7x. They lie on top of the dash, port end (vessel
   * axes, `stowYawDeg` turned). VR: grip within `grabRange` to take them; held within
   * `eyeRange` of your eyes you look through them (a `renderSize` square view). Desktop:
   * hold Z.
   */
  binoculars: {
    magnification: 7,
    stow: [-1.05, 2.6, -1.74] as [number, number, number],
    stowYawDeg: 20,
    grabRange: 0.14,
    eyeRange: 0.2,
    renderSize: 640,
  },

  /** Bridge-control interaction tuning. */
  interaction: {
    /** Direct grab: hand within this distance of a lever knob / the wheel rim (m). */
    grabRadius: 0.12,
    /** Direct press: controller tip within this distance of a button / switch (m). */
    touchRadius: 0.06,
    /** Pointer-ray fallback length (m) for controls just out of reach. */
    rayLength: 1.5,
    /** Desktop reticle reach (m). */
    desktopReach: 2.6,
    /** Displays redraw rate (Hz). */
    displayHz: 10,
  },

  /** The in-game menu (Y in VR, O on desktop). */
  menu: {
    /** Panel width (m); the height follows from the number of rows. */
    width: 0.24,
    /** Bottom-centre of the panel on the left grip (m, grip axes: +Y up, -Z forward). */
    wristOffset: [0, 0.05, -0.02] as [number, number, number],
    /** Tilt about the grip's X axis; negative leans the top away so it faces you. */
    wristTiltDeg: -35,
    /** Distance in front of the head when the menu floats (desktop / no left controller). */
    floatDistance: 0.55,
    /** Poke: the fingertip counts as on the panel within this distance of it (m)... */
    pokeReach: 0.04,
    /** ...presses when it gets this close (m)... */
    pokeDepth: 0.006,
    /** ...and must back off this far before the next press (m). */
    pokeRelease: 0.02,
    /** Pointer-ray reach for the menu (m). */
    rayLength: 2.0,
  },

  desktop: {
    eyeHeight: 1.7,
    /** Walking speed (m/s); Shift = run (x locomotion.runMultiplier). */
    walkSpeed: 1.6,
    /** Ladder climbing speed with Space / C (m/s). */
    climbSpeed: 1.0,
    /** Free-fly speed (m/s). */
    moveSpeed: 4,
    fastMultiplier: 5,
    lookSensitivity: 0.0022,
  },

  /** Milestone 2 test scene: a pile-mounted observation platform above the waves. */
  testScene: {
    /** Vessel type spawned in the test scene (a key of CONFIG.vessels / VESSEL_DEFS). */
    vesselDefId: 'workboat',
    platformDeckHeight: 3.0,
    platformHalfSize: 3.0,
  },

  /**
   * How shut-in the wheelhouse is, for sound (0 open .. 1 shut): the aft door is the big
   * opening, so shutting it counts `door` (the windows the rest). Inside, wind, rain and the
   * hull wash are muffled by that much (the wash by up to `washMuffle`).
   */
  wheelhouseSound: {
    door: 0.6,
    washMuffle: 0.6,
  },

  debug: {
    overlayVisibleAtStart: false,
    surfaceProbesVisibleAtStart: false,
    hydroDebugVisibleAtStart: false,
    /** How often the overlay text is refreshed (Hz). */
    overlayUpdateHz: 4,
  },
};

export type Config = typeof CONFIG;
