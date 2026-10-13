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
        powerKw: 200,
        idleRpm: 600,
        ratedRpm: 1800,
        /** Full-load torque curve (rpm, N*m): heavy-duty 6-cyl, ~25 % torque rise, cut-out at 1950. */
        torqueCurve: [
          [0, 0],
          [300, 500],
          [600, 850],
          [1000, 1250],
          [1300, 1320],
          [1600, 1210],
          [1800, 1061],
          [1900, 600],
          [1950, 0],
        ] as [number, number][],
        /** Internal friction torque: a + b*rpm (N*m). */
        frictionTorque: 60,
        frictionPerRpm: 0.05,
        /** Rotating inertia at the crankshaft, engine + flywheel + gearbox (kg*m^2). */
        inertia: 3.2,
        /** Governor droop: full rack this many RPM below the set speed. */
        droopRpm: 120,
        /** Turbo / smoke limiter: fuel rack may rise at most this much per second. */
        rackRiseRate: 0.45,
        /** Starter motor torque (N*m) up to its maximum speed, and cranking time before firing. */
        starterTorque: 450,
        starterMaxRpm: 160,
        crankTime: 1.6,
        /** The engine will only start with the lever in neutral (like a real neutral-safety switch). */
        startOnlyInNeutral: true,
        gearRatio: 3.0,
        gearEfficiency: 0.97,
        /** Clutch: lever must sit in the new direction this long, near idle, before it engages (s). */
        shiftDelay: 0.6,
        /** Lever travel either side of centre that counts as neutral (detent). */
        neutralBand: 0.08,
      },
      propeller: {
        /** Large, slow, four-blade workboat propeller (m). Tip just below the keel line. */
        diameter: 1.05,
        /**
         * Linearised open-water coefficients, J = Va / (n*D), pitch ratio ~0.85 (matched so
         * the engine just reaches rated RPM at full speed; open-water efficiency ~0.5):
         *   K_T(J) = kt0 * (1 - J / j0)     thrust = K_T * rho * n^2 * D^4
         *   K_Q(J) = kq0 * (1 - J / jq0)    torque = K_Q * rho * n^2 * D^5
         */
        kt0: 0.38,
        j0: 0.88,
        kq0: 0.045,
        jq0: 0.98,
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
        /** Sized to the big prop: ~1.0 m span x 0.55 m chord, mostly in the slipstream. */
        area: 0.55,
        /** Normal-force slope dC_N/dalpha (per rad) for a low aspect-ratio spade rudder, and stall angle. */
        liftSlope: 2.4,
        stallDeg: 28,
        maxAngleDeg: 35,
        /** Hydraulic steering rate (deg/s). */
        rateDegPerS: 14,
        /** Fraction of the propeller's slipstream momentum increase seen at the rudder. */
        washFactor: 0.8,
        /** Cap on the slipstream's extra rudder force, as a fraction of propeller thrust. */
        washMaxFraction: 0.55,
        /** Hull flow straightening of the lateral inflow at the rudder (0..1). */
        flowStraightening: 0.5,
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
        /** Combined throttle/gear lever on the console top, pivoting fore-aft. */
        lever: { position: [0.45, 2.16, -1.5] as [number, number, number], maxAngleDeg: 40, length: 0.2 },
        startButton: { position: [0.78, 2.16, -1.52] as [number, number, number] },
        hornButton: { position: [-0.42, 2.16, -1.52] as [number, number, number] },
        navLightsSwitch: { position: [-0.78, 2.16, -1.52] as [number, number, number] },
        /** Instrument dash across the front of the console: displays on its aft face. */
        dash: { front: -1.82, aft: -1.66, bottom: 2.15, top: 2.56, halfWidth: 1.25, tiltDeg: 14 },
        /** Display centres (x) on the dash, and their size (m). Order: speed, heading, rpm, rudder. */
        displays: { x: [-0.95, -0.52, 0.52, 0.95], y: 2.36, width: 0.38, height: 0.22 },
      },
      /**
       * Wet exhaust: smoke and engine cooling water leave through one outlet in the transom,
       * starboard side, just above the DWL, blowing aft (vessel axes; +z is aft).
       */
      exhaust: {
        position: [0.9, 0.22, 6.04] as [number, number, number],
        direction: [0, -0.12, 1] as [number, number, number],
      },
      /** Navigation lights (vessel axes): masthead, sidelights, stern light. */
      navLights: {
        masthead: [0, 4.62, 0.33] as [number, number, number],
        port: [-1.52, 3.42, -1.75] as [number, number, number],
        starboard: [1.52, 3.42, -1.75] as [number, number, number],
        stern: [0, 2.0, 5.92] as [number, number, number],
      },
      /** Where a player stands after boarding (vessel axes): at the helm, facing forward. */
      boardingSpot: [0, 1.2, -0.75] as [number, number, number],
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

  /** Player movement aboard and on the platform. */
  locomotion: {
    /** Grab-the-world (grip + drag) is always on; smooth stick movement is optional. */
    smoothEnabled: true,
    smoothSpeed: 1.4,
    snapTurnDeg: 30,
    /** Stick deflection that triggers a snap turn, and that must be released before the next. */
    snapThreshold: 0.7,
    /** Floor-height following time constant (s), smooths steps like the doorway sill. */
    floorSmoothing: 0.12,
  },

  comfort: {
    /**
     * Motion coupling between the deck and the player's view, 0..1 (BeamNG-style).
     *   1   = rigidly attached: you feel every roll, pitch and heave of the deck.
     *   0.x = a critically damped "neck and knees" spring between deck and view: slow,
     *         gross motion is followed, faster roll/pitch/heave is soaked up, like the
     *         human head-stabilisation reflexes do.
     *   0   = horizon level, height smoothed.
     * Heading and horizontal position always stay locked to the deck (walking/collision).
     * Adjust in VR: hold X and push the left stick up/down. Desktop: 9 / 0.
     */
    // Default rigid: in VR testing, decoupling also moved the hands relative to the deck
    // (they live in the same rig as the head), making the bridge controls hard to grab.
    motionCoupling: 1.0,
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

  desktop: {
    eyeHeight: 1.7,
    /** Walking speed (m/s); Shift = brisk. */
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

  debug: {
    overlayVisibleAtStart: true,
    surfaceProbesVisibleAtStart: false,
    hydroDebugVisibleAtStart: false,
    /** How often the overlay text is refreshed (Hz). */
    overlayUpdateHz: 4,
  },
};

export type Config = typeof CONFIG;
