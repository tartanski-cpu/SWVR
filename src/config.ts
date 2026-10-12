/**
 * Every tunable number in the game lives here, grouped by module.
 * Units are SI (metres, seconds, kilograms, radians) unless the name says otherwise.
 */
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
    /** Sea water density (kg/m^3), used by buoyancy from milestone 3. */
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
  },

  vessels: {
    /**
     * 12 m hard-chine displacement workboat. Axes: +X starboard, +Y up, -Z forward;
     * origin on the centreline, amidships, at the design waterline (DWL).
     * Hydrostatics of this hull at DWL (computed from the stations, see tests/vessel.test.ts):
     *   displacement 17.9 m^3 = 18.35 t, LCB 2.25 m aft of amidships, KB 0.62 m,
     *   GM ~1.17 m with VCG at +0.45 (KG 1.40 m), GZ max ~0.45 m at 30-45 deg.
     */
    workboat: {
      hull: {
        length: 12.0,
        beamDeck: 4.2,
        beamChine: 3.7,
        keelY: -0.95,
        chineYAft: -0.4,
        chineYBow: 0.5,
        deckYAft: 0.95,
        deckYBow: 1.5,
        stations: 17,
      },
      /** kg. Chosen to float at the DWL. */
      mass: 18300,
      /** Centre of gravity (m, vessel axes). z = LCB so she floats level. */
      cg: [0, 0.45, 2.25] as [number, number, number],
      /** Radii of gyration (m): roll ~0.4 B, pitch and yaw ~0.25-0.27 L. */
      gyradius: { roll: 1.68, pitch: 3.0, yaw: 3.2 },
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
         * Gives heave and pitch damping (~13 % of critical in heave).
         */
        vertical: 800,
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
         * Angular damping (N*m*s/rad). Roll: ~10 % of critical
         * (critical = 2*sqrt(Delta*g*GM * I_roll) ~ 233 kN*m*s for this hull).
         */
        roll: 24000,
        pitch: 20000,
        yaw: 20000,
      },
      /**
       * Calm-water resistance R(V) = R_friction + R_wave, applied at mid-draft at the LCB.
       *   R_friction = 0.5*rho*S*V^2 * C_F(Re) * (1 + k),  C_F = ITTC-57 line
       *   R_wave     = Delta*g * (waveA*Fn^4 + waveB*max(0, Fn - waveKnee)^2)
       * The second wave term is the steep rise past Fn ~0.35 that makes a displacement hull
       * hit a "wall" around Fn 0.45-0.5 (~9.5 kn here). S (wetted surface) is computed
       * from the hull stations at the DWL.
       */
      resistance: {
        lwl: 11.0,
        formFactor: 0.2,
        waveA: 1.0,
        waveB: 0.94,
        waveKnee: 0.3,
        /** Going astern (transom first) is less efficient. */
        asternFactor: 2.6,
        /** Height (vessel y) at which resistance acts (~ mid-draft). */
        y: -0.45,
      },
      /** Single diesel through a reverse/reduction gearbox to one fixed-pitch propeller. */
      engine: {
        /** Maximum continuous rating (kW) - informational; the model is RPM-governed. */
        powerKw: 180,
        idleRpm: 700,
        maxRpm: 2300,
        /** First-order RPM response time constants (s); spool-up also stands in for turbo lag. */
        spoolUpTime: 4.0,
        spoolDownTime: 0.9,
        /** Cranking time before the engine catches (s). */
        crankTime: 1.6,
        /** The engine will only start with the lever in neutral (like a real neutral-safety switch). */
        startOnlyInNeutral: true,
        gearRatio: 2.4,
        /** Clutch: lever must sit in the new direction this long, at idle, before it engages (s). */
        shiftDelay: 0.6,
        /** Lever travel either side of centre that counts as neutral (detent). */
        neutralBand: 0.08,
      },
      propeller: {
        diameter: 0.7,
        /**
         * Linearised open-water thrust coefficient: K_T(J) = kt0 * (1 - J / j0),
         * J = Va / (n*D). kt0 ~0.45 for a pitch ratio ~1 workboat prop.
         */
        kt0: 0.45,
        j0: 1.05,
        /** Astern thrust as a fraction of ahead (blade sections work backwards). */
        asternEfficiency: 0.45,
        /** Taylor wake fraction w and thrust deduction t. */
        wake: 0.15,
        thrustDeduction: 0.15,
        /** Shaft line position (vessel axes, m). */
        position: [0, -0.62, 5.0] as [number, number, number],
      },
      rudder: {
        area: 0.36,
        /** Normal-force slope dC_N/dalpha (per rad) for a low aspect-ratio spade rudder, and stall angle. */
        liftSlope: 2.4,
        stallDeg: 25,
        maxAngleDeg: 35,
        /** Hydraulic steering rate (deg/s). */
        rateDegPerS: 14,
        /** Fraction of the propeller's slipstream momentum increase seen at the rudder. */
        washFactor: 0.6,
        /** Cap on the slipstream's extra rudder force, as a fraction of propeller thrust. */
        washMaxFraction: 0.45,
        /** Hull flow straightening of the lateral inflow at the rudder (0..1). */
        flowStraightening: 0.5,
        position: [0, -0.55, 5.65] as [number, number, number],
      },
      /** Where a player stands after boarding (vessel axes): aft deck, facing forward. */
      boardingSpot: [0, 0.97, 4.2] as [number, number, number],
      /** Debug: spawn/drop point and drop height (m above the DWL). */
      spawn: { x: 0, z: -22, dropHeight: 4, headingDeg: 90 },
    },
  },

  /** Debug keyboard / VR-stick driving (milestone 4; physical controls arrive in 6). */
  debugDriving: {
    /** Lever travel per second while the key is held (full range is -1..1). */
    leverRate: 0.6,
    /** Helm travel per second while the key is held (full range is -1..1). */
    helmRate: 0.8,
  },

  desktop: {
    eyeHeight: 1.7,
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

  debug: {
    overlayVisibleAtStart: true,
    surfaceProbesVisibleAtStart: false,
    hydroDebugVisibleAtStart: true,
    /** How often the overlay text is refreshed (Hz). */
    overlayUpdateHz: 4,
  },
};

export type Config = typeof CONFIG;
