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
          /**
           * The front windows' sill (above the floor), higher than the sides': level with
           * the top of the instrument dash (`bridge.dash.top`), so the front glass starts
           * where the view over the dash does (owner request).
           */
          frontSill: 1.36,
          /**
           * Pilot-house front (owner request): the front from its window sill up leans
           * forward this many degrees (reverse rake: the glass top is forward of its foot,
           * so it sheds spray and cuts glare). The windows, mullions and the panel above
           * them lean; the front wall below the sill stays upright. A brow carries the roof
           * edge out over the raked glass. 0 for an upright front.
           */
          frontRakeDeg: 22,
          /**
           * The side windows' sill raised alongside the helm console (owner sketch): from the
           * front back to `z1`, the side wall stands solid up to `height` above the floor
           * (the console top), then slopes back down to the normal sill over `slope` m.
           */
          sideRaise: { height: 0.95, z1: -1.32, slope: 0.35 },
          /**
           * A sliding door in the port side wall, between the helm console and the chart
           * table (owner request): opening z0..z1, `height` above the floor. Like the aft
           * door it slides aft along the outside of the wall, worked by a push button on its
           * forward jamb inside and out (`buttonHeight` above the floor). Vessel control
           * `sideDoor` (1 open), shut at the start.
           */
          sideDoor: { z0: -1.12, z1: -0.37, height: 2.0, buttonHeight: 1.15 },
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
        /**
         * The door's push buttons, on its starboard jamb inside and out (the door slides to
         * port, the ladder is further to starboard): x, and height above the wheelhouse floor.
         */
        doorButtons: { x: 0.48, height: 1.15 },
        /**
         * The engine hatch in the wheelhouse floor, aft to starboard (vessel x0..x1, z0..z1),
         * hinged on its outboard edge, and how deep the engine space under it is (m below
         * the floor). Open, the hole can't be walked into.
         */
        engineHatch: { x0: 0.42, x1: 1.2, z0: -0.18, z1: 0.76, pitDepth: 0.85 },
        /** Bulwark and rail heights above the deck, and how close a player may get to the deck edge. */
        bulwarkHeight: 0.3,
        railHeight: 1.0,
        /** Notch in the transom bulwark on the centreline for the towline's stern roller (width, m; 0 none). */
        fairleadGap: 0.44,
        /**
         * A gate in the starboard bulwark and rail at the working deck (owner request: for
         * getting into and out of the skiff alongside with cargo). Between z0 and z1 (m),
         * clear of the midship cleat forward and the swim ladder aft. Hinged on its forward
         * post, it swings inboard (`openDeg`) at a press of the green button on its aft post
         * (inboard and outboard faces, `buttonHeight` above the deck). Vessel control
         * `sideGate` (1 open), shut at the start. Open, you can walk out to the deck edge
         * in the gateway and jump down; jump up from the skiff (or climb out of the water)
         * within `boardRange` (m) outboard of it and you're aboard, helped by a fixed step on
         * the hull side `stepDrop` (m) below the deck.
         */
        sideGate: { side: 1, z0: 2.6, z1: 3.4, openDeg: 90, buttonHeight: 0.85, boardRange: 1.8, stepDrop: 0.55 },
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
         * The console's switch row (owner request: group like with like), port to starboard,
         * each group on its own colour-coded plate (`consoleGroups`):
         *   LIGHTS        nav lights, cabin light, wipers (port end)
         *   SEARCH · FIRE the fire pump and searchlight switches, each just ahead of its own
         *                 joystick on the two port pedestals (left hand aims, right hand
         *                 keeps the throttle)
         *   horn          on its own, just left of the wheel
         *   DECK          anchor, trawl: behind the throttle, used with it in hand
         *   ENGINE        HEAT (glow plugs) and START (hold), the key, the warning lamps
         *                 (oil, charge, glow, neutral, bilge) ahead of them; the laminated
         *                 start-up card below, on the console's upright face
         */
        navLightsSwitch: { position: [-1.29, 2.16, -1.52] as [number, number, number] },
        cabinLightSwitch: { position: [-1.14, 2.16, -1.52] as [number, number, number] },
        /** Windscreen wipers (Instruments breaker). */
        wipersSwitch: { position: [-0.99, 2.16, -1.52] as [number, number, number] },
        spotlightSwitch: { position: [-0.48, 2.16, -1.52] as [number, number, number] },
        hornButton: { position: [-0.28, 2.16, -1.52] as [number, number, number] },
        /** Windlass: up = heave in / stowed, down = let go. */
        anchorSwitch: { position: [0.39, 2.16, -1.52] as [number, number, number] },
        heatButton: { position: [0.8, 2.16, -1.5] as [number, number, number] },
        startButton: { position: [0.94, 2.16, -1.5] as [number, number, number] },
        keySwitch: { position: [1.08, 2.16, -1.5] as [number, number, number] },
        warningLamps: { position: [0.95, 2.165, -1.6] as [number, number, number], spacing: 0.085 },
        /**
         * The laminated start-up card: on the console's upright aft face below the ENGINE
         * group, facing the helmsman (owner: on the dash top it glowed white at night; down
         * here, on the panel lighting, it dims and goes red with the instruments).
         */
        checklistCard: { position: [1.12, 1.84, -1.315] as [number, number, number], width: 0.19, height: 0.26 },
        /** Searchlight joystick on a pedestal to port of the wheel (mirrors the throttle's). */
        spotJoystick: { position: [-0.45, 2.16, -1.15] as [number, number, number] },
        /**
         * Group plates under the switch row: title, x extent, colour of the strip along the
         * forward edge (the title sits on it).
         */
        consoleGroups: [
          { title: 'LIGHTS', x: [-1.32, -0.91] as [number, number], color: 0xd8b028 },
          { title: 'SEARCH · FIRE', x: [-0.89, -0.38] as [number, number], color: 0xc0402a },
          { title: 'DECK', x: [0.19, 0.72] as [number, number], color: 0x2f6fd0 },
          { title: 'ENGINE', x: [0.74, 1.32] as [number, number], color: 0x3a9a4a },
        ],
        /**
         * VHF radio hung close under the wheelhouse roof, out to port above the window head
         * (3.15 m) so it doesn't block the view (owner feedback), tilted down and turned
         * toward the helm (yaw: + turns its face toward starboard); its handset hangs on a
         * clip on its starboard side.
         */
        radio: { position: [-1.0, 3.2, -1.45] as [number, number, number], tiltDeg: 35, yawDeg: 35 },
        /** Chartplotter, the same out to starboard (rescue/cargo chart). */
        chart: { position: [0.98, 3.17, -1.45] as [number, number, number], tiltDeg: 35, yawDeg: -35 },
        /** SKIFF CRANE: launch / recover the skiff from the helm (DECK group; she's in view ahead). */
        craneButton: [0.65, 2.16, -1.52] as [number, number, number],
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
       * Above `holdingN` the anchor drags. Scope paid out: `scopeRatio` × water depth, at least
       * `minScopeFromRoller` × the bow roller's height above the seabed.
       */
      anchor: {
        /** Bow roller / hawse (vessel axes). */
        hawse: [0, 1.35, -5.7] as [number, number, number],
        chainM: 60,
        /** 10 mm chain, weight in water (N/m). */
        chainWeightNPerM: 16,
        /** Holding power in sand/mud of a ~25 kg anchor (N). */
        holdingN: 20000,
        /**
         * Chain paid out per metre of water depth (owner: 5:1 minimum, 7:1 recommended).
         * 5 keeps her from swinging wide in shallow anchorages; 7 holds better in a blow.
         */
        scopeRatio: 5,
        /** Never less than this ratio from the bow roller (below 3:1 the anchor holds poorly). */
        minScopeFromRoller: 3,
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
          /** The hydraulic pump's clutch and the valve solenoids (DECK HYD, engine running). */
          hydraulics: 4,
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
       * Fenders: three a side (vessel z), hung over the rail when out; stowed lying along
       * the bulwark. One press on the fender basket (aft deck, starboard) puts them all out
       * or takes them in. The aft pair and the basket stand clear of the deck gate
       * (layout.sideGate) and its swing (they were at z 3.4 and 2.4).
       */
      fenders: { z: [-2.4, 0.6, 3.9], basket: [1.75, 1.95] as [number, number] },
      /**
       * Engine oil (vessel/maintenance.ts): level 0..1 when the session starts; burnt at
       * `use` per second running (more under load); a check is due every `checkEvery` s of
       * running. Below `lowAt` the dipstick says top up; below `lampAt` the OIL lamp
       * blinks. The engine sits in its own space under the wheelhouse floor, reached through
       * a hatch in the floor (layout.engineHatch; owner request: the waist-high casing was in
       * the way). `engine`: the block's centre (x, z) and size (fore-aft length, width,
       * height), its top just under the floor. On it: the dipstick on its inboard side
       * ([x, z]), the oil filler cap on the rocker cover ([x, z]); the oil can stands on a
       * shelf on the engine space's outboard side ([x, z], `shelfDrop` below the floor).
       */
      maintenance: {
        oilStart: 0.72,
        use: 0.00025,
        checkEvery: 900,
        lowAt: 0.4,
        lampAt: 0.12,
        engine: { x: 0.8, z: 0.28, length: 0.72, width: 0.42, height: 0.56 },
        dipstick: [0.56, 0.12] as [number, number],
        filler: [0.8, 0.46] as [number, number],
        oilCan: [1.16, 0.6] as [number, number],
        shelfDrop: 0.32,
      },
      /**
       * Bilge (vessel/bilge.ts): a damaged hull leaks into it (wear.leakRate); the bilge pump
       * (BILGE breaker, float switch) empties it at `pumpRate` (fraction/s). The BILGE lamp
       * lights above `alarmAt`.
       */
      bilge: { pumpRate: 1 / 90, alarmAt: 0.3 },
      /**
       * Tender crane (vessel/tenderCrane.ts, controls/TenderCraneView.ts), vessel axes: the
       * skiff in a cradle on the foredeck, bow forward, put over the side by a knuckle-boom
       * crane on the starboard foredeck, as yachts carry their tenders (owner request: the
       * stern davit was in the way of towing and trawling).
       *   column     the crane's base (x, z) on deck; `shoulderY` the boom's pivot height
       *              (absolute); `boom` and `jib` the two arms' lengths
       *   stow       her origin in the cradle; `cradle` its footprint (half-width, z0..z1),
       *              kept clear of walking and cargo
       *   lift       the hook on her (her axes): the 4-leg bridle's apex, over her CG
       *   clear      how high she's hoisted out of the cradle before slewing (her keel
       *              clears the bow rail)
       *   outboard   her origin (x, z) over the side, alongside the starboard bow, where
       *              she's lowered to `waterY` and let go, and recovered from
       * LAUNCH first unfolds the crane and hooks on (`rigTime`, she stays in the cradle), then
       * hoists (`hoistTime`), slews (`slewTime`), lowers (`lowerTime`). RECOVER (she
       * must be within `recoverRange` of the outboard spot, moving slower than
       * `recoverSpeed` relative to us) lines her up under the hook in `alignTime`, then runs
       * it backwards, ending with the crane unhooked and folded. In the cradle she's under a
       * tarpaulin (her motor and fittings aren't drawn) and her battery charges from the ship
       * (`chargeMinutes` from flat to full). `fold`: the crane's transport position while
       * she's stowed or away (deg): slewed (`slewDeg`, -90 = forward), the boom just below
       * level (`boomDeg`), the jib folded back over it (`jibDeg`, its direction).
       */
      tenderCrane: {
        column: [1.25, -2.25] as [number, number],
        columnRadius: 0.13,
        shoulderY: 2.45,
        boom: 1.55,
        jib: 1.45,
        stow: [0, 1.75, -3.95] as [number, number, number],
        cradle: { halfWidth: 0.9, z0: -5.85, z1: -2.05 },
        lift: [0, 1.1, 0.76] as [number, number, number],
        clear: 1.1,
        outboard: [3.3, -2.6] as [number, number],
        waterY: 0.0,
        rigTime: 2.5,
        hoistTime: 3,
        slewTime: 6,
        lowerTime: 6,
        alignTime: 2.5,
        recoverRange: 3.0,
        recoverSpeed: 1.2,
        chargeMinutes: 5,
        fold: { slewDeg: -90, boomDeg: -8, jibDeg: 165 },
        /**
         * LAUNCH / RECOVER buttons: on the column's control box, on its outboard side facing
         * starboard (reached from the starboard side deck); a SKIFF CRANE button on the
         * console (bridge.craneButton); and a remote on a post in the skiff by the helmsman
         * (`remote`: x, z in her axes, and its height), to call a recovery from the water.
         */
        button: [1.47, 2.25, -2.25] as [number, number, number],
        remote: { x: 0.55, z: 1.3, height: 0.95 },
        /** Crew still in her when she's back in the cradle step out here (x, z on our foredeck). */
        stepOff: [
          [-1.25, -2.7],
          [1.55, -2.9],
          [-1.25, -3.4],
          [1.45, -3.5],
        ] as [number, number][],
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
          [-1.95, 3.0], [-1.95, 4.0], [-1.4, 5.3],
          [1.95, 3.0], [1.95, 4.0], [1.4, 5.3],
          [0, 3.6], [0, 4.2],
        ] as [number, number][],
        lashRange: 1.1,
      },
      /**
       * Cabin light: a ceiling lamp in the wheelhouse (vessel axes) and its light (cd, m).
       * One real PointLight, hidden when off (no per-pixel cost; one shader recompile per switch).
       */
      /** Ceiling lamp: white `intensity`, or red at `redIntensity` (night: enough to see the controls, not to dazzle). */
      cabinLight: { position: [0, 3.22, -0.2] as [number, number, number], intensity: 3, redIntensity: 0.45, distance: 6 },
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
       * On it: the paper chart, a pen holder (pencil, eraser), dividers, and a lamp (its
       * shade over the chart at `head`) with its own switch
       * (Deck lights breaker). All positions are on the table top: [x, z].
       */
      // Pushed aft against the aft wall (owner feedback), under the whiteboard: more room
      // behind the helm.
      // A drop leaf on the port wall (owner request: with the logbook gone the fixed table was
      // too big): just long enough for the chart and the pen holder, 75 cm deep (the chart
      // covers its depth). `lamp`: the wall bracket ([x, z]; x at the wall), the arm's height
      // above the table and the shade over the chart's middle; the lamp switch on the batten
      // at its aft end ([x, z]).
      chartTable: {
        x0: -1.37,
        x1: -0.62,
        z0: 0.1,
        z1: 1.05,
        height: 0.95,
        holder: [-1.3, 0.97] as [number, number],
        lamp: { base: [-1.37, 0.52] as [number, number], height: 0.5, head: [-0.98, 0.52] as [number, number] },
        lampSwitch: [-1.34, 0.99] as [number, number],
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
        /**
         * Stabilised like the fire monitor (owner request): the lamp holds its aim against
         * her roll and pitch, so the beam stays on a target in a seaway. Pan is still from
         * the bow (turn her and the beam turns), elevation from the horizon.
         */
        stabilised: true,
      },
      /**
       * Fire monitor (fire missions, fire/fire.ts): a water cannon on the wheelhouse roof,
       * aft of the searchlight, fed by an engine-driven pump. In the wheelhouse: the FIRE
       * PUMP switch on the console and the monitor joystick on its own pedestal (red knob),
       * both port of the searchlight's (SEARCH · FIRE group): pan (+ to starboard) and elevation
       * at a rate, like the searchlight's. The jet leaves the nozzle at `nozzleSpeed` m/s
       * (`flowLpm` L/min) and flies a ballistic arc, slowed a little by the air
       * (`airDrag`, 1/s) and blown downwind (`windDrift` of the wind's speed); it only
       * flows with the pump on AND the engine running (no pressure otherwise).
       */
      /**
       * Fishing: the TRAWL switch on the console, and the A-frame over the transom where the
       * warps lead and the net's drag acts (fishing/fishing.ts, trawlView.ts).
       */
      fishing: {
        trawlSwitch: [0.52, 2.16, -1.52] as [number, number, number],
        /**
         * The A-frame over the transom (fishing/fishing.ts aFrameOf; owner request, now the
         * stern is clear of the skiff): two legs from the quarters (`footInset` in from the
         * deck edge, `footFromTransom` forward of it), raked aft to a crossbeam `height` above
         * the deck, `headAft` beyond the transom, each leg braced from part way up down to the
         * deck `braceForward` m forward of its foot. The warps run through a block on the beam
         * each side (`blockX`). The by-hand PAY OUT / HAUL buttons (hold-to-run) are on a
         * control box built onto the starboard leg, `buttonHeight` above the deck.
         */
        aFrame: { footInset: 0.2, footFromTransom: 0.55, height: 3.0, headAft: 0.3, braceForward: 0.8, blockX: 0.75, buttonHeight: 1.0 },
      },
      /**
       * The tow winch (tow/tow.ts stepTowWinch): a small drum on the aft deck centreline just
       * forward of the transom (`z`, drum radius and width), the line leading aft from it
       * over the stern roller in the transom bulwark (CONFIG.tow.fairlead), driven from a
       * gearbox housing on its starboard end (`housing` width and height above the deck) with
       * the HEAVE IN / PAY OUT buttons (hold-to-run) on its top. You stand forward of it
       * facing aft: the winch, the stern roller and the tow beyond. The trawl warps lead off the
       * same winch to the A-frame's blocks.
       */
      towWinch: { z: 5.3, drumRadius: 0.16, drumWidth: 0.5, housing: { width: 0.4, height: 0.8 } },
      fireMonitor: {
        position: [0, 3.75, -0.55] as [number, number, number],
        joystick: [-0.85, 2.16, -1.15] as [number, number, number],
        pumpSwitch: [-0.82, 2.16, -1.52] as [number, number, number],
        /**
         * The fire gauge on the console ahead of the joystick (fire/fireGauge.ts; owner:
         * better feedback): bar centre (vessel axes), bar length (m), and how far right of
         * the bar's end the ON TARGET lamp sits (m).
         */
        gauge: { position: [-0.66, 2.162, -1.52] as [number, number, number], length: 0.12, lampX: 0.05 },
        panLimitDeg: 170,
        tiltMinDeg: -10,
        tiltMaxDeg: 55,
        panRateDeg: 40,
        tiltRateDeg: 22,
        nozzleSpeed: 30,
        flowLpm: 2400,
        airDrag: 0.12,
        windDrift: 0.35,
        /**
         * Stabilised (owner request: too hard to keep it on a fire as she rolls): the
         * monitor holds its aim against the boat's roll and pitch, like a gyro-stabilised
         * monitor. Pan is still from the bow (turn the boat and the jet turns with her),
         * elevation from the horizon, not the roof.
         */
        stabilised: true,
      },
      /**
       * Mooring cleats (owner request: they replace the DOCK button): a horn cleat on the
       * bulwark top forward and aft on each side. Click one alongside a berth and its line
       * goes to that berth's bollard; click it again to let go. `cleatFwdZ` / `cleatAftZ`:
       * where they stand (vessel z, m; the bow line's and stern line's points on the boat).
       * `lineY`: the height the lines pull at (m, vessel axes; they pull horizontally).
       */
      mooring: {
        cleatFwdZ: -4.3,
        cleatAftZ: 4.4,
        /**
         * Midship cleats, just aft of the wheelhouse at the fore end of the working deck
         * (owner request): for the skiff's painter while working cargo over the side.
         */
        cleatMidZ: 2.0,
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
   * making the lines fast at the cleats warps the boat in and the lines then hold her
   * alongside. They are horizontal spring-dampers at bow and stern towards the berth, so
   * she still heaves and rolls.
   */
  docking: {
    /**
     * The skiff's painter (vessel/physics/painter.ts): her bow line to one of the ship's cleats,
     * so she doesn't blow away. Made fast to the forward starboard cleat as she touches the
     * water off the crane; click her bow cleat to let go or make fast to the nearest cleat in
     * `reach` (m, bow cleat to ship's cleat), or a midship cleat to lead it there. It's made
     * fast with `slack` (m) more than the distance, at least `minLength`, at most `maxLength`.
     * A rope only pulls: taut, a spring (`stiffness` N/m; 12 mm braid stretches a little) with
     * damping at `dampingRatio` of critical so she doesn't bounce on it. It parts above
     * `breakForce` (N) or stretched `maxStretch` (m), as if she's towed off at speed.
     */
    painter: { reach: 6, slack: 0.5, minLength: 2.5, maxLength: 7, stiffness: 3000, dampingRatio: 0.7, breakForce: 15000, maxStretch: 2.0 },
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
    /**
     * Seconds between calls while she's out of harbour and free (first one too). Doubled
     * after V1.0 (owner: too many calls; was 240-540).
     */
    every: [480, 1080] as [number, number],
    /** Relative odds of each kind (def ids). */
    weights: { derelict: 1, logRaft: 1, barge: 0.7 } as Record<string, number>,
    /** Where it's adrift: this far ahead (m), this far off to one side (m), in open water. */
    ahead: [450, 850] as [number, number],
    offset: [80, 260] as [number, number],
    minDepth: 6,
    minPortDistance: 400,
    /** An unanswered call goes away after this long (s); the alert repeats this often (s). */
    callTimeout: 120,
    /** The radio's call alert repeats this often while unanswered (s; was 10, owner: too insistent). */
    callRepeat: 20,
    /** Towline: length (m), and the most the bow eye may be from our towing post to make it fast (m). */
    lineLength: 22,
    attachRange: 16,
    /**
     * The tow winch by the stern roller (hold-to-run): heave in / pay out speeds (m/s), the
     * shortest and longest line it allows (m), the most it can pull in against (N), and the
     * slack left when a line is made fast (m: it's made fast at the distance to the tow plus
     * this, so heaving in starts pulling her at once).
     */
    winch: { heaveSpeed: 0.6, payOutSpeed: 1.0, minLength: 4, maxLength: 60, pullN: 18000, makeFastSlack: 1.0 },
    /** Line stiffness (N/m) and damping as a fraction of critical. */
    stiffness: 6000,
    dampingRatio: 0.5,
    /** It parts above this tension (N) or this stretch (m). */
    breakForce: 40000,
    /** With the heavy towing post (career upgrade): this much more. */
    heavyPostFactor: 1.75,
    maxStretch: 12,
    /** Delivered: the tow within this of a port (m), slower than this (m/s), for this long (s). */
    deliverRadius: 170,
    deliverSpeed: 0.8,
    deliverTime: 5,
    /** A delivered tow is taken over by the harbour (removed) this long after the hand-over (s). */
    removeAfter: 8,
    /**
     * The towline leads from the winch drum aft over a stern roller in a notch in the
     * transom bulwark on the centreline (owner request: no towing post on deck; a closed
     * fairlead was too fussy). The tow pulls on the boat at the top of the roller: its height
     * above the deck (m), how far in from the transom (m), and the roller's radius (m).
     */
    fairlead: { height: 0.24, inset: 0.03, rollerRadius: 0.06 },
    /** Debug "tow job alongside": this far astern of us (m). */
    debugDistance: 12,
    /**
     * Debris on the towline: a point mass (kg) with water drag F = (dragLinear + dragQuad |v|) v
     * (N; about 0.5 rho Cd A for a waterlogged tangle of planks and a drum: ~5 kN at 3.5 m/s).
     */
    debris: { mass: 900, dragLinear: 150, dragQuad: 350 },
  },

  /**
   * The career (career/career.ts): money (£), reputation per port (0..100) and the harbour
   * offices' contracts and upgrades.
   *   pay       per job, before the port's reputation factor (1 .. 1 + repPayBonus at 100):
   *             cargo `cargoBase` + `cargoPerKm` per km between the ports; a box of fish (x
   *             `iceFactor` with the ice machine); a salvage log; debris cleared; a lost
   *             crate brought in; tows by kind; a rescue plus per survivor; a fire put out.
   *   costs     fuel per litre (a full 600 L tank from empty is ~£960), a can of oil, cargo
   *             lost overboard (and reputation at its port).
   *   rep       gained per job (or lost), at the port it's for.
   *   contracts `perPort` offers at each office, renewed every `refresh` s. Per kind: the
   *             item counts by tier (reputation `tierRep` at that port to take each tier),
   *             the bonus per item and the time allowed per item (s).
   *   upgrades  price and the best port reputation needed.
   */
  career: {
    startMoney: 500,
    /** Paid when the first voyage (the tutorial) is done. */
    tutorialBonus: 200,
    /** Radar upgrade: echoes on the plotter within this (m). */
    radarRange: 2800,
    ledgerKeep: 12,
    repPayBonus: 0.5,
    pay: {
      cargoBase: 60,
      cargoPerKm: 50,
      fishBox: 45,
      iceFactor: 1.3,
      log: 180,
      debris: 40,
      crate: 80,
      tow: { derelict: 600, logRaft: 450, barge: 800 } as Record<string, number>,
      towDefault: 500,
      rescue: 400,
      rescuePerPerson: 150,
      fire: 650,
    },
    costs: { fuelPerL: 1.6, oil: 35, lostCargo: 100 },
    /** Repairs in port (phase 2): per % of hull damage, per % of engine wear (an overhaul). */
    repairs: { hullPerPercent: 30, enginePerPercent: 25 },
    /** Danger money: rescues, tows and fires in a squall or a sea over `stormHs` m pay this much more. */
    stormBonus: 0.5,
    stormHs: 1.8,
    rep: { cargo: 2, fish: 1, log: 3, debris: 1, tow: 6, rescue: 10, fire: 8, contract: 8, contractFail: -6, lostCargo: -3, max: 100 },
    contracts: {
      perPort: 2,
      refresh: 600,
      tierRep: [0, 15, 40],
      kinds: {
        cargo: { counts: [2, 4, 6], bonusPer: 90, secondsPer: 480 },
        fish: { counts: [4, 8, 12], bonusPer: 35, secondsPer: 240 },
        logs: { counts: [1, 2, 3], bonusPer: 160, secondsPer: 720 },
      },
    },
    upgrades: [
      { id: 'radar', name: 'Radar', price: 2400, minRep: 20, desc: 'Debris and floating crates on the plotter' },
      { id: 'towPost', name: 'Heavy towing post', price: 1500, minRep: 10, desc: 'The towline holds 75 % more before it parts' },
      { id: 'trawl', name: 'Bigger trawl', price: 1800, minRep: 10, desc: 'The net fills half as fast again' },
      { id: 'ice', name: 'Ice machine', price: 1200, minRep: 0, desc: 'Iced fish fetch 30 % more' },
    ],
  },

  /**
   * Damage and wear (vessel/wear.ts). Hull: a hit faster than `impactSafe` m/s (about 2 kn:
   * docking speed is fine) does (v - impactSafe)^2 x `impactDamage`; grinding over the
   * bottom (sliding faster than `slideSafe` m/s under more than `grindForce` N) does
   * `grindDamage` per metre. Damage leaks `leakRate` of the bilge per second at 1 (the pump
   * clears 1/90 per s: it keeps up below ~0.45). A full bilge weighs `bilgeMassFull` kg.
   * Engine: wear per s per °C over `hotC`, and per s with the sump under `lowOil`; at
   * wear 1 the rack is capped at 1 - `powerLoss`.
   */
  wear: {
    impactSafe: 1.0,
    impactDamage: 0.08,
    slideSafe: 0.4,
    grindForce: 20000,
    grindDamage: 0.02,
    leakRate: 1 / 40,
    bilgeMassFull: 3000,
    hotC: 98,
    hotWear: 0.0004,
    lowOil: 0.15,
    dryWear: 0.004,
    powerLoss: 0.5,
  },

  /**
   * Log salvage (salvage/salvage.ts): logs wash up on beaches every `every` s (the first
   * after `firstAfter`), at most `max`, `length` m long, `mass` kg. Pulling one off the
   * beach takes more than mu_s m g (~8 kN) on the line; sliding, mu_k. Afloat it drags
   * (dragLinear + dragQuad |v|) v N, and floats once the ground is `floatDepth` m under.
   * Beach spots: water `reachDepth` m deep `reachOut` m off the shore, `portClear` m from
   * ports; logs wash up at least `minDistance` m from the boat and go after `expire` s
   * if nobody comes. The towline to a log is longer (`line`): we stand off the beach.
   */
  salvage: {
    every: [240, 540] as [number, number],
    firstAfter: 120,
    max: 3,
    length: [7, 11] as [number, number],
    mass: 1500,
    frictionStatic: 0.55,
    frictionKinetic: 0.4,
    dragLinear: 250,
    dragQuad: 450,
    floatDepth: 0.4,
    reachDepth: 2.2,
    reachOut: 20,
    portClear: 300,
    minDistance: 500,
    expire: 1800,
    /** Debug "log on the nearest beach": within this of the boat (m). */
    debugNear: 3000,
    line: { length: 30, attach: 30 },
  },

  /**
   * Fishing (fishing/fishing.ts): the grounds (centre, radius m, richness), trawling speed
   * (m/s; 1.0-2.3 is 2-4.5 kn), seconds of good trawling per box at richness 1, how long the
   * net takes out and in (s), where it fouls (shallower than m), and its drag on the boat:
   * (dragLinear + dragQuad |v|) v N (~10 kN at 3 kn), fouled `foulDrag` |v| and a
   * `foulHold` N pull astern. Boxes appear `boxInset` m in from the transom.
   */
  fishing: {
    grounds: [
      { name: 'Calder Bank', x: 1700, z: 650, radius: 300, richness: 1.2 },
      { name: 'Skerry Ground', x: -150, z: -150, radius: 250, richness: 0.8 },
      { name: 'The Hollows', x: -1100, z: 1000, radius: 320, richness: 1.0 },
    ],
    minSpeed: 1.0,
    /**
     * Raised from 2.1 (4 kn) with the drag below (owner feedback after V1.0: the trawling
     * speed was hard to hold, too fast). With the net out she now makes about 1.9 kn idling
     * in gear, 2 kn at 12 % lever, 4 kn at ~55 % and 4.5 kn at ~65 %: half the lever's
     * ahead travel is good trawling, where before it was 8-23 %.
     */
    maxSpeed: 2.3,
    boxEvery: 40,
    /** The bigger trawl (career upgrade) fills this much faster. */
    bigTrawlFactor: 1.5,
    shootTime: 10,
    haulTime: 12,
    snagDepth: 7,
    /** No fishing in a sea bigger than this (Hs, m). */
    maxHs: 2.2,
    /** Tripled after V1.0: the old net (3.5 kN at 3 kn) let her make 3 kn idling in gear. */
    dragLinear: 1800,
    dragQuad: 3000,
    /** Fouled on the bottom: well above the net's normal drag (27 kN at 1.5 m/s). */
    foulDrag: 18000,
    foulHold: 6000,
    boxInset: 2.2,
  },

  /**
   * Wildlife (wildlife/wildlife.ts): decoration, a pure function of world time and the
   * boat's pose. Gulls: how many, the radius (m), height above the sea (m) and turn rate
   * (rad/s) of their circles, how far their centres wander about the boat (m). Dolphins: a
   * pod of `count` in most (`chance`) slots of `every` s, staying `stay` s, if she's doing
   * more than `minSpeed` m/s in water deeper than `minDepth` m, `minPortDistance` m from a
   * port. Neither come out after dark (darkness above `night`, 0 day .. 1 night).
   */
  wildlife: {
    gulls: { count: 6, radius: [12, 35] as [number, number], height: [7, 18] as [number, number], turnRate: [0.15, 0.32] as [number, number], wander: 12 },
    dolphins: { count: 4, every: 300, chance: 0.6, stay: 70, minSpeed: 2, minDepth: 12, minPortDistance: 500 },
    night: 0.6,
    /** Seconds between gull calls (when gulls are about). */
    gullCallEvery: [4, 12] as [number, number],
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
    /** Seconds between fire calls (doubled after V1.0, owner: too many calls; was 300-660). */
    every: [600, 1320] as [number, number],
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
    /** The radio's call alert repeats this often while unanswered (s; was 10, owner: too insistent). */
    callRepeat: 20,
    startIntensity: 0.6,
    growth: 0.004,
    douse: 0.02,
    outBelow: 0.03,
    /** The coastguard calls the progress as the fire comes below these fractions of full (owner: better feedback). */
    progressCalls: [0.5, 0.2] as [number, number],
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
      /**
       * A lobster / crab pot (potting/potting.ts): not trade cargo (never spawned at the
       * ports' goods stacks), but carried, stowed and lashed the same way. A creel: a
       * boxy frame with netting, its line coiled on top and the marker buoy tied to it.
       */
      { name: 'Pot', mass: 24, size: [0.75, 0.42, 0.5] as [number, number, number], shape: 'pot' as const, slots: 2 },
    ],
    /** How many of `kinds` (from the start) are trade cargo, spawned at the goods stacks. */
    tradeKinds: 5,
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
    /** How long each weather holds (s). Doubled after V1.0 (owner: the weather changed too often; was 240-600). */
    hold: [480, 1200] as [number, number],
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
     * Shipping forecast on the VHF (every 12 min since V1.0, was 6): every `every` s, and `afterChange` s after the weather
     * turns (the plan for the next change is new). Received only with the radio on.
     */
    forecast: { every: 720, afterChange: 30 },
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
    /**
     * Pantograph wipers, pivoted on the header above each front pane: one sweep there and
     * back (s), half-angle (deg), arm length and upright blade length (m), and the pivot's
     * height above the window head (m).
     */
    wiperPeriod: 1.7,
    wiperSweepDeg: 45,
    /** Sized to the shorter front panes (raised front sill): the blade stays on the glass across the sweep. */
    wiperArm: 0.42,
    wiperBlade: 0.36,
    wiperPivotAbove: 0.1,
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
   * as such a track exists (debris only out of harbour). Ship types:
   * length, beam, speed (m/s), AIS names. Sighted within min(`sightRange`, visibility x
   * `sightVis`). In restricted visibility they sound a prolonged blast every 2 min, and
   * answer yours. Hazards: floating debris (spawned like ships, drifting). The fixed
   * hazards (rocks, a reef, a wreck) and their buoys are world data (archipelago.ts MARKS).
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
    /** Shortest gap between two ship sightings the lookout calls (s). */
    sightEvery: 300,
    hornRange: 3000,
    ships: {
      cargo: { length: 82, beam: 13, speed: 6.5, names: ['Hebridean Trader', 'Lorne Carrier', 'Skerry Star'] },
      fishing: { length: 19, beam: 6, speed: 4, names: ['Morning Dew', 'Silver Harvest', 'Girl Isla'] },
      yacht: { length: 12, beam: 3.8, speed: 3, names: ['Kittiwake', 'Blue Moon', 'Saorsa'] },
    },
    debrisEvery: [300, 600] as [number, number],
  },

  /**
   * The chart's grid (nav/geo.ts): the latitude and longitude of the world origin. The
   * archipelago is fictional; this just makes positions read like real ones.
   */
  nav: { originLat: 56.62, originLon: -5.95 },

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

  duties: {
    /** A finished duty stays up, ticked, this long (s), then drops off. */
    doneLinger: 15,
    /** Hull damage and engine wear above which they go on the board (vessel/wear.ts). */
    damageAt: 0.02,
    wearAt: 0.1,
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

  /** Player movement aboard and ashore. */
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
    /** Lowered after V1.0 (owner: too many calls; was 0.5). */
    chance: 0.35,
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
    /** The radio's call alert repeats this often while unanswered (s; was 10, owner: too insistent). */
    callRepeat: 20,
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
   * hold the middle mouse button (the right one is the binoculars). Reach (m); what it hits is found `hitRate` times a second.
   * Desktop: the beam starts at a "hand" `deskHand` (m: right, up, forward of the eyes), so it's
   * seen from the side; started at the eyes it would be seen end-on, just a dot.
   */
  /**
   * Panel lighting (controls/panelLighting.ts): the wheelhouse's self-lit screens, labels
   * and dials dim with the daylight to `nightLevel` of their daytime brightness at full
   * dark. As night falls (darkness from `redFrom` to `redTo`, 0 day .. 1 night) they turn
   * red by themselves (owner: automatic, no switch), dimmer still at `redLevel` of that.
   */
  panelLighting: { nightLevel: 0.3, redLevel: 0.6, redFrom: 0.55, redTo: 0.85 },

  /**
   * Other players' figures (net/avatarView.ts, looks in net/avatarOutfits.ts). Upper body
   * only (owner's choice): head, a torso hanging from the neck to the waist, two-part arms
   * with elbows reaching to the hands. The torso turns toward where the head looks but lags
   * (`bodyTurnRate` 1/s) and never twists more than `maxTwistDeg` from it; its waist sits
   * `lean` of the way back toward the feet, so leaning the head leans the body.
   * Lengths in m. Arms hang relaxed when a hand isn't tracked (desktop's left hand).
   */
  avatar: {
    neckDrop: 0.13,
    torsoLength: 0.55,
    shoulderHalf: 0.18,
    shoulderDrop: 0.07,
    upperArm: 0.3,
    forearm: 0.29,
    bodyTurnRate: 4,
    maxTwistDeg: 50,
    lean: 0.5,
  },

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
    /**
     * ...except at the controls: in the wheelhouse, or with the reticle on a control, the
     * desktop view eases to riding rigidly with the boat over `desktopRigidTime` s, so the
     * console holds still under the reticle (with the softer coupling it swung by several
     * degrees in a seaway, worst for crew-mates joining, whose boat moves in snapshot steps).
     */
    desktopRigidAtControls: true,
    desktopRigidTime: 0.5,
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
   * hold the right mouse button (or Z).
   */
  binoculars: {
    magnification: 7,
    stow: [-1.05, 2.6, -1.74] as [number, number, number],
    stowYawDeg: 20,
    grabRange: 0.2,
    eyeRange: 0.2,
    renderSize: 640,
  },

  /**
   * Lobster and crab potting (potting/potting.ts; owner's feature, milestone 1: pots as
   * cargo and shooting them). Off unless switched on (Settings → Game → Potting) while it's
   * being built.
   *   pallet     where the pots wait on the quay (world x, z, yaw deg) and how many: you
   *              have `pots` of them; any lost are replaced there (pots are free for now)
   *   maxShot    the most pots in the water at once, for everyone (cap on world records)
   *   sinkTime   seconds from the splash until the pot's on the bottom and the marker buoy
   *              pops up (s)
   *   buoyColors each boat's buoy colour (by boat), flag colour while soaking
   */
  potting: {
    pallet: { x: 719, z: 638, yawDeg: 90 },
    pots: 5,
    maxShot: 24,
    sinkTime: 2.5,
    /** Desktop: a pot set down from the rail is thrown this far out the way you look (m). */
    deskThrow: 1.4,
    buoyColors: [0xf26a1a, 0xf2d21a, 0xe0306a, 0x2ab0e0],
    flagSoaking: 0xd8281c,
    /**
     * Soak time (milestone 2). Measured in time played (world time, s), not the game's
     * clock: the time of day stands still unless you speed it up in the menu, so "a day"
     * wouldn't pass. A pot is ready to haul after `soakReady` (20 min) and its catch keeps
     * improving until `soakBest` (40 min); after that, no better.
     */
    soakReady: 1200,
    soakBest: 2400,
    /** The ready cue: flag green instead of red, and a little light blinking on it at night; only within this distance (m), so you still have to find your marks. */
    flagReady: 0x28c040,
    cueRange: 45,
    /**
     * Storm drift: in wind over `dragFrom` (m/s) a pot drags along the bottom downwind, its
     * buoy with it, at `dragRate` m/s for every m/s over (a squall's 17 m/s: about 1.5 m a
     * minute). It stops where the water gets too shallow.
     */
    dragFrom: 11,
    dragRate: 0.004,
    /** A local potter on the VHF now and then, telling of good ground (s between, from first switched on). */
    tipEvery: [900, 1500] as [number, number],
    tipFirst: 240,
    /** Casual mode: your pots shown on the chartplotter too (off: the crew's marks on the paper chart are all you have). */
    showOnPlotter: false,
    /**
     * Hauling (milestone 3): hook the buoy with the boat hook (its tip within `hookReach`
     * m of the buoy), bring it alongside and aboard (within `liftRange` m of the hull),
     * then haul the line hand over hand: each pull takes in the hand's travel x
     * `pullScale` (desktop: `deskPull` m a click). The line is the depth plus `slack` (m).
     * In a swell over `slipFrom` m (significant height), stop pulling for `slipAfter` s and
     * the pot's weight drags the line back out at `slipRate` m/s per m of swell over.
     */
    haul: { hookReach: 0.95, liftRange: 2.5, pullScale: 1.6, deskPull: 2.5, slack: 1.5, slipFrom: 1.0, slipAfter: 1.5, slipRate: 0.6 },
    /**
     * The catch, worked out when the pot comes up (a seeded random, the same for everyone):
     * the expected haul is the ground's quality x the soak (0..1, potting.ts soakFactor) x
     * the bait (`unbaited` without) x the weather (`roughFactor` if it's blowing over
     * `roughWind` m/s). Up to `lobsterMax` lobsters and `crabMax` crabs at best. Off any
     * ground the quality is `offGround`. A `bycatch` chance of a small fish, a starfish or
     * (`bootChance` of those) an old boot.
     */
    catch: { lobsterMax: 2, crabMax: 6, offGround: 0.15, unbaited: 0.35, roughWind: 11, roughFactor: 0.7, bycatch: 0.25, bootChance: 0.12 },
    /** A catch crate (a fish box of crab and lobster) holds this many. */
    crateCapacity: 12,
    /** The bait tub on deck (vessel x, z), outside the wheelhouse's aft wall, port side. */
    baitBox: [-0.95, 1.85] as [number, number],
  },

  /**
   * Hand gear on brackets inside the wheelhouse, on the aft wall in its starboard corner
   * (player/handGear.ts; owner request). VR: grip within `grabRange` to take one off its
   * bracket; it stays in the hand while you hold the grip and goes back when you let go.
   * Desktop: click it to take it, click its bracket (or U) to put it back. `bracket`: where
   * it hangs (vessel axes, its middle). `deskHold`: where a desktop player holds it (camera
   * axes, m).
   */
  handGear: {
    grabRange: 0.2,
    deskHold: [0.22, -0.3, -0.5] as [number, number, number],
    /**
     * A 6 kg water-mist / foam extinguisher (hold the trigger, or the left mouse button, to
     * spray). The spray leaves the nozzle at `nozzleSpeed` (m/s) and falls under gravity
     * with `airDrag` (per s), reaching 5-6 m: get close. Where it passes through the fire
     * it knocks it down at `douse` x the fire monitor's rate (CONFIG.fire.douse) - small,
     * but a fire you're close to goes out. A charge lasts `seconds` of spraying; hung back
     * on its bracket it's swapped for a full one.
     */
    extinguisher: { bracket: [1.05, 1.62, 1.33] as [number, number, number], nozzleSpeed: 9, airDrag: 0.6, douse: 0.8, seconds: 60 },
    /**
     * A big rechargeable torch (trigger or left click: on / off). Lit, a real spotlight from
     * its lens (`angleDeg` half-angle, `intensity`, `distance` m), only for your own torch.
     * Sized for a person in the water 5-6 m off (owner): at 7 degrees the pool is about 1.4 m
     * across at 6 m. It also has its own pool on the sea (ocean shader uTorch*). Crew-mates'
     * torches show as a beam. `realLight` false: a beam only for yours too (no
     * extra light in the scene, for a cheaper frame on the Quest).
     */
    torch: { bracket: [1.25, 1.72, 1.36] as [number, number, number], angleDeg: 7, intensity: 260, distance: 45, realLight: true },
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
    /**
     * Desktop aim help (degrees): a reticle that just misses a control still picks the
     * nearest one within `desktopAssistDeg` of its edge, and a control under the reticle
     * stays picked until the aim is `desktopStickyDeg` off it. In a seaway the console
     * swings under the reticle (the desktop view is steadied against the roll), and for a
     * crew-mate joining it moves in 20 Hz snapshot steps: without this, small switches
     * flicker in and out of reach.
     */
    desktopAssistDeg: 2.5,
    desktopStickyDeg: 5,
    /**
     * After you set a control, how long (ms) it waits for the host's state to show it
     * before believing an older value (a joining crew-mate's round trip; see Control).
     */
    pendingMs: 800,
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
    /**
     * Reading the paper chart: while the crosshair is on it from standing at the table,
     * the view eases in by this much (camera zoom; owner feedback: desktop players had to
     * crouch or lean in to read it). The look slows to match. 1 = off.
     */
    chartZoom: 1.7,
    /** How far from the eyes the chart counts as "at the table" (m), and the ease rate (1/s). */
    chartZoomReach: 1.5,
    chartZoomRate: 5,
  },

  /** The boat the game is played in (a key of CONFIG.vessels / VESSEL_DEFS). */
  testScene: {
    vesselDefId: 'workboat',
  },

  /**
   * Where a new game starts (owner request for v1.0: no start platform or buoys out at sea).
   * The workboat lies moored alongside `berthId` in Calder Haven, the sheltered harbour
   * behind the breakwaters, and you stand on the quay beside her (`quay`: x, z; facing
   * `yawDeg`, 90 = west, toward her). Crew joining a game come aboard her. Tests still
   * start her in open water at the vessel's `spawn`.
   */
  start: {
    berthId: 'calder-cargo',
    quay: { x: 713, z: 661.5, yawDeg: 90 },
  },

  /**
   * How shut-in the wheelhouse is, for sound (0 open .. 1 shut): the aft door is the big
   * opening, so shutting it counts `door` (the windows the rest). Inside, wind, rain and the
   * hull wash are muffled by that much (the wash by up to `washMuffle`).
   */
  /**
   * Inside the wheelhouse: the engine's level (x) and low-pass (Hz) with the aft door open
   * and shut (on deck: full, unfiltered). Wind, rain, wash and fire are muffled by the door
   * too; `washMuffle` is how much of the wash goes with it shut.
   */
  wheelhouseSound: {
    engineInside: 0.75,
    engineInsideLp: 1200,
    engineShut: 0.45,
    engineShutLp: 320,
    washMuffle: 0.6,
  },

  debug: {
    /** Log how many wheelhouse parts the interior-detail culling took (performance pass). */
    logDetail: false,
    overlayVisibleAtStart: false,
    surfaceProbesVisibleAtStart: false,
    hydroDebugVisibleAtStart: false,
    /** How often the overlay text is refreshed (Hz). */
    overlayUpdateHz: 4,
  },
};

export type Config = typeof CONFIG;
