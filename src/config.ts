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
         * Angular damping (N*m*s/rad). Roll: ~15 % of critical in the free-decay trial
         * (critical = 2*sqrt(Delta*g*GM * I_roll) ~ 233 kN*m*s for this hull), roughly a
         * hard-chine hull with modest bilge keels. Raised from 24000 (~11 %) on owner feedback.
         */
        roll: 33000,
        pitch: 20000,
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
        startButton: { position: [0.78, 2.16, -1.52] as [number, number, number] },
        hornButton: { position: [-0.42, 2.16, -1.52] as [number, number, number] },
        navLightsSwitch: { position: [-0.78, 2.16, -1.52] as [number, number, number] },
        /** Windlass: up = heave in / stowed, down = let go. */
        anchorSwitch: { position: [-0.6, 2.16, -1.52] as [number, number, number] },
        cabinLightSwitch: { position: [-0.96, 2.16, -1.52] as [number, number, number] },
        spotlightSwitch: { position: [-1.14, 2.16, -1.52] as [number, number, number] },
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
        heaveRate: 0.35,
        /** Windlass stalls above this pull (N). */
        windlassPullN: 9000,
        tautStiffness: 30000,
        tautDamping: 15000,
        catenarySoftness: 3,
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
        hookStow: [-1.72, 1.55, 2.6, 5.0] as [number, number, number, number],
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
        lashPoints: [
          [-1.75, 3.0], [-1.75, 4.2], [-1.75, 5.4],
          [1.75, 3.0], [1.75, 4.2], [1.75, 5.4],
          [0, 3.6], [0, 5.0],
        ] as [number, number][],
        lashRange: 1.1,
      },
      /**
       * Cabin light: a ceiling lamp in the wheelhouse (vessel axes) and its light (cd, m).
       * One real PointLight, kept at intensity 0 when off so switching never recompiles shaders.
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
       * Deck lights. Floods: a lamp on the wheelhouse roof edge aimed at a point on deck,
       * each ONE real SpotLight (cd, m, half-angle, penumbra), kept at 0 when off (no shader
       * recompiles). Rail lights: LED strips along the inside of the bulwark tops - glow
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
       * Docking (the DOCK button) and the mooring lines that hold her: bow and stern line
       * points (vessel axes, at the deck edge on the berth side are found automatically).
       */
      mooring: {
        lineZ: 4.5,
        lineY: 1.2,
      },
      /** Where a player stands after boarding (vessel axes): at the helm, facing forward. */
      boardingSpot: [0, 1.2, -0.75] as [number, number, number],
      /** Debug: spawn/drop point and drop height (m above the DWL). */
      spawn: { x: 0, z: -22, dropHeight: 4, headingDeg: 90 },
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
    /** Skiff loading at an anchorage needs the boat nearly stopped (m/s). */
    maxSpeed: 0.6,
    /** Set an item down ashore within this of its destination's goods stack to deliver it (m). */
    deliveryRadius: 12,
    /** Spacing of items waiting in a port's stack row (m). */
    stackSpacing: 0.9,
    /**
     * Kinds of cargo, all man-portable (carried by hand): name, mass (kg), size (m: across,
     * height, along) and shape. Above `twoHandKg` an item needs both hands.
     */
    kinds: [
      { name: 'Crate', mass: 40, size: [0.6, 0.45, 0.5] as [number, number, number], shape: 'box' as const },
      { name: 'Fish box', mass: 30, size: [0.8, 0.3, 0.5] as [number, number, number], shape: 'box' as const },
      { name: 'Sack', mass: 50, size: [0.55, 0.3, 0.85] as [number, number, number], shape: 'box' as const },
      { name: 'Gas bottle', mass: 70, size: [0.32, 1.1, 0.32] as [number, number, number], shape: 'drum' as const },
      { name: 'Oil drum', mass: 110, size: [0.58, 0.88, 0.58] as [number, number, number], shape: 'drum' as const },
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
    snapTurnDeg: 30,
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
    stations: [
      { freq: '88.6', name: 'Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
      { freq: '91.2', name: 'Radio Paradise', url: 'https://stream.radioparadise.com/mp3-128' },
      { freq: '94.7', name: 'Swiss Jazz', url: 'https://stream.srg-ssr.ch/m/rsj/mp3_128' },
      { freq: '97.3', name: 'Swiss Classic', url: 'https://stream.srg-ssr.ch/m/rsc_de/mp3_128' },
      { freq: '101.5', name: 'Secret Agent', url: 'https://ice1.somafm.com/secretagent-128-mp3' },
      { freq: '104.8', name: 'Deutschlandfunk', url: 'https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3' },
    ],
    fullRange: 3,
    range: 16,
    /** Streams are mastered loud: their level at 100 % on the FM volume setting (owner: too loud). */
    gain: 0.2,
  },

  /** Pings: "look here" markers (player/ping.ts). Lifetime (s), beam height (m), reach (m). */
  ping: {
    life: 10,
    beamHeight: 30,
    reach: 2500,
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
     * Adjust in VR: the menu (Y), or hold X and push the left stick up/down. Desktop: 9 / 0.
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
