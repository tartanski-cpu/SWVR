/**
 * Every tunable number in the game lives here, grouped by module.
 * Units are SI (metres, seconds, kilograms, radians) unless the name says otherwise.
 */
export type WeatherPresetName = 'Clear' | 'Overcast' | 'Fog' | 'Rain' | 'Squall';

/** A career upgrade, bought at the yard (CONFIG.career.upgrades). */
export interface CareerUpgrade {
  id: string;
  name: string;
  price: number;
  /** The best port reputation needed to buy it. */
  minRep: number;
  desc: string;
  /** A module her boat must carry to take it (its id), and what to call it ("Needs the trawl gear"). */
  needs?: string;
  needsName?: string;
  /**
   * Equipment the yard fits to the workboat (the starter boat: owner, Oct 2026): the sockets
   * of her recipe (boats/starterWorkboat.json; "helm/trawl" for one in the helm console) a
   * new career's workboat is built without, until it's bought.
   */
  fit?: string[];
  /**
   * The same equipment on the beginner boat (boats/fleet.ts, a Shipyard design): the choices
   * it sets in her design (shipyard/design.ts ShipDesign). None: it doesn't fit her.
   */
  design?: Record<string, number>;
}

/**
 * How wide a player's body is for walking into things (m: half their width): house walls,
 * gear and the deck's edge keep this far off. Every boat's layout uses it (`bodyRadius`),
 * Shipyard designs too (shipyard/build.ts). 0.22 kept people out of narrow side decks: with
 * the deck-edge margin (0.25-0.3), a side deck had to be over half a metre wide. Shoulders
 * turn sideways down a narrow deck, so 0.14 (owner, Oct 2026).
 */
export const BODY_RADIUS = 0.14;

// Towable hulls (CONFIG.vessels.derelict / logRaft / barge): displacement at the DWL (kg) and
// LCB (m aft), as their physics stations (`physicsStations`) integrate them, so they float
// level on their DWL.
const DERELICT_MASS = 2800;
const DERELICT_LCB = 1.29;
const LOGRAFT_MASS = 6490;
const LOGRAFT_LCB = 1.02;
const BARGE_MASS = 10540;
const BARGE_LCB = 1.43;
const DORY_MASS = 1310;
const DORY_LCB = 1.04;
const YACHT_MASS = 11010;
const YACHT_LCB = 2.05;
const TRAWLER_MASS = 70110;
// The coaster (a tug's tow, Oct 2026): 1,064 t at her 3.4 m draught (uprightHydrostatics at her DWL).
const COASTER_MASS = 1063840;
const COASTER_LCB = 9.73;
const TRAWLER_LCB = 3.26;
const PONTOON_MASS = 123240;
const PONTOON_LCB = 3.17;
/**
 * The landing craft's cabin floor (m, vessel axes): 0.19-0.23 m below the deck around the
 * cabin, so you step down into it for the headroom (2.2 m to the roof). Everything in her
 * cabin is placed from it.
 */
const LC_FLOOR = 0.77;
/** The Alaskan 38's house floor (m above the DWL): her pilothouse's, a step up from the cockpit deck (1.02 at the door). */
const A38_FLOOR = 1.25;

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

  /**
   * Pixel painting (owner, Oct 2026): small low-resolution detail images on the boats'
   * surfaces (non-slip deck, wood lining, floor matting, chequer plate),
   * drawn as crisp pixels, Stormworks style: detail without extra shapes or draw calls.
   * The images are generated at start-up (render/pixelPaint.ts), greyscale, and multiply each
   * part's own colour, so they take any livery.
   */
  pixelPaint: {
    /** How strongly the detail shows: 0 off (plain colours, as before) .. 1 full. */
    strength: 1,
    /**
     * How much surface one repeat of each image covers (m, square). Each image is 64 x 64
     * pixels, so wood at 2 m is 32 pixels a metre. `crate` and `window` are whole pictures
     * stretched to one face each (keep them at 1). Step 2 (cargo, harbours, sea marks):
     * sacking on sacks, worn paint on drums, buoys and posts, weatherboarding, render,
     * corrugated sheet and slates on the houses and sheds, concrete on the quays, stone on
     * the breakwaters.
     */
    tileMetres: { nonSlip: 1, wood: 2, mat: 1, chequer: 0.5, crate: 1, sacking: 2, worn: 1.5, boards: 2, render: 2, sheet: 2, slates: 2, concrete: 4, stone: 3, window: 1, rust: 2 },
    /** Width of the black window frames round the wheelhouse glass (m). */
    frameWidth: 0.06,
  },
  render: {
    antialias: true,
    maxPixelRatio: 2,
    fovDeg: 70,
    near: 0.05,
    /**
     * Far plane (m): out to the clearest day's horizon (environment.hazeFar), so a region's
     * landmark hill shows across the sound (regions, milestone 2). Depth precision at the
     * far end is coarse (tens of metres), which is why far-off land is drawn above the
     * waterline only and nudged toward the camera (worldView.ts).
     */
    far: 14000,
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
    /**
     * Game-hours per real second. 0 = frozen sun. Time flows by default since the regions
     * (owner): one game hour in five real minutes (the menu's x12), so a day is two real
     * hours and a six-hour race cycle half an hour, with slack windows minutes long.
     */
    timeScale: 12 / 3600,
    /** Sea (and air) temperature (°C): a cold engine starts here, the cooler rejects heat to it. */
    seaTempC: 14,
    /** Hours added per keypress of N / M (debug). */
    timeStepHours: 0.5,
    /** Observer latitude and solar declination drive the sun path (degrees). */
    latitudeDeg: 50,
    solarDeclinationDeg: 12,
    /**
     * The clearest day's haze (m): scene fog runs out to the visibility, or to this, whichever
     * is less, so even on a clear day the sea and the far land dissolve into the sky by here
     * (the camera's far plane sits just beyond). Was 2600 before the regions: the next
     * region's hill, 4-5 km off, was simply not drawn.
     */
    hazeFar: 13500,
    /** Radius (m) of the sky dome; must be inside the camera far plane. */
    skyRadius: 13800,
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
      /** Half-width (m) of the wave-detailed tile; beyond it the cells grow faster (`farGrowth`) out to `farRadius`. */
      radius: 3000,
      /**
       * Half-width (m) of the whole tile: past environment.hazeFar, so the sea's edge is
       * always lost in the haze. The cells out there are hundreds of metres across: no wave
       * is drawn on them (they fade with the grid), it's the flat, hazed sea to the horizon.
       */
      farRadius: 14000,
      farGrowth: 1.25,
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
    /**
     * Foam the wind makes (owner: whitecaps, and the lines of foam along the wind when it
     * blows hard), from the weather's wind speed (m/s), as the Beaufort scale describes:
     *   white horses on the crests from `capsFrom` (force 4, 5.5 m/s), frequent by `capsFull`
     *   (force 7, 13.9 m/s);
     *   foam blown into streaks along the wind from `streakFrom` (force 6, 10.8 m/s), well
     *   marked by `streakFull` (force 9, 20.8 m/s): lines about `streakLength` m long and
     *   `streakWidth` m apart (the noise's blob sizes: the lines are sparser), drifting downwind at `drift` m/s.
     * Fixed to the water (they ride the swell); faded in sheltered water.
     */
    windFoam: { capsFrom: 5.5, capsFull: 13.9, streakFrom: 10.8, streakFull: 20.8, streakLength: 90, streakWidth: 3.5, drift: 0.6 },
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
         * Ignition (diesel): key ON (the glow plugs preheat on their own, GLOW lamp lit), wait for the lamp to go out, then hold START.
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
         * Trolling valve (propulsion.ts leverDemand): lever travel (from centre) over which
         * the engine stays at idle and the clutch slips, the propeller turning from
         * `trollingMinShaft` of its speed at the detent up to all of it here. 0: none (the
         * workboat). The landing craft and the Shipyard's boats have one (owner: their big
         * engines idling in gear were too fast to handle).
         */
        trollingLever: 0,
        trollingMinShaft: 0.3,
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
         *   UA   = baseLoss + exchanger * thermostat opening (0 at openC .. 1 at fullC)
         *          * (rpm / rated)^pumpFlowExp: the engine-driven raw-water pump's flow;
         *   lugging  the rack ahead of the revs (rack - rpm / rated, when positive: full fuel
         *          with the revs held down) puts `lugHeat` x that much more of the fuel's heat
         *          into the water: smoke and a hot exhaust.
         * The exchanger is sized so flat out at rated revs she settles in the mid 80s (°C);
         * towing flat out, or a hull that won't plane, overheats: alarm, derate, not shutdown.
         * Oil follows the coolant with a lag, running hotter under load.
         */
        thermal: {
          heatToCoolant: 0.3,
          lhvMJPerKg: 42.7,
          /** kJ/K; about half a real engine's, so warming up takes minutes rather than half an hour. */
          heatCapacity: 150,
          thermostatOpenC: 80,
          thermostatFullC: 88,
          /** Sea-water heat exchanger conductance, thermostat fully open, pump at rated revs (kW/K). */
          exchangerKwPerK: 4.4,
          /** The raw-water pump's flow with the revs: (rpm / rated) to this power (1: in proportion). */
          pumpFlowExp: 1,
          /** Extra heat to the water per unit of lugging (rack - rpm / rated): 1 = 20 % more at 0.2. */
          lugHeat: 1,
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
        /** Player body radius used for collision with walls (BODY_RADIUS, top of this file). */
        bodyRadius: BODY_RADIUS,
      },
      /**
       * Bridge (vessel axes, m). Since modular boats M3 the helm console and its controls and
       * screens are modules (CONFIG.modules.helmConsole and friends, mounted by the recipe
       * src/boats/starterWorkboat.json); here are only the places the hull offers them, and
       * the overhead sets still built by the bridge.
       *   console     the helm console's reference point: its top (floorY + consoleHeight =
       *               2.15), on the centreline, at its aft face (z -1.32). The helmsman
       *               stands at z ~ -0.75.
       *   navDisplay  the NAV / WIND screen (owner request: position and wind data):
       *               overhead on the centreline, just forward of the overhead panel, tilted
       *               steeply down toward the helm, above the line of sight out of the
       *               windscreen (which tops out at 3.15 m).
       */
      bridge: {
        console: { position: [0, 2.15, -1.32] as [number, number, number] },
        navDisplay: { position: [0, 3.2, -1.32] as [number, number, number] },
        /**
         * Where the VHF hangs (the hull's 'vhf' socket): close under the wheelhouse roof, out
         * to port above the window head (3.15 m) so it doesn't block the view (owner
         * feedback), turned toward the helm (yaw: + turns its face toward starboard). The set
         * is a module: CONFIG.modules.vhf.
         */
        radio: { position: [-1.0, 3.2, -1.45] as [number, number, number], yawDeg: 35 },
        /** Where the chartplotter hangs ('chartplotter' socket): the same out to starboard. */
        chart: { position: [0.98, 3.17, -1.45] as [number, number, number], yawDeg: -35 },
        /** SKIFF CRANE: launch / recover the skiff from the helm (DECK group; she's in view ahead). */
        craneButton: [0.65, 2.16, -1.52] as [number, number, number],
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
        cutoffSoc: 0.02,
        // What each device draws is its module's (modular boats M4a, M5a): the instruments,
        // chartplotter, VHF, FM, chart lamp, the panel itself and the windlass in
        // CONFIG.modules; the starter, glow plugs and alternator in modules.dieselInboard; the
        // bilge and hydraulic pumps in theirs; the lights, horn and wiper motor in the recipe.
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
         * Where the breaker panel goes (the hull's 'breakerPanel' socket): against the
         * starboard wall just under the window sill (the side walls are windows above it),
         * its face tilted up toward you by `tiltDeg`. The panel itself (the voltmeter and the
         * breakers) is a module: CONFIG.modules.breakerPanel.
         */
        panel: { position: [1.22, 1.84, -0.85] as [number, number, number], tiltDeg: 40 },
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
        /**
         * The workboat's deck height at the column (m). Placed elsewhere (its socket is the
         * foot of the column), its heights move with the deck there.
         */
        deckAtColumn: 1.2099609375,
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
       * gives her a list. Anything on open deck (clear of the houses and the gear on it) can be
       * strapped down where it stands (owner, Oct 2026: no D-rings to find).
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
      },
      /**
       * Cabin light: a ceiling lamp in the wheelhouse (vessel axes) and its light (cd, m).
       * One real PointLight, hidden when off (no per-pixel cost; one shader recompile per switch).
       */
      /** Ceiling lamp: white `intensity`, or red at `redIntensity` (night: enough to see the controls, not to dazzle). */
      cabinLight: { position: [0, 3.22, -0.2] as [number, number, number], intensity: 3, redIntensity: 0.45, distance: 6 },
      /**
       * Where the overhead switch panel goes (the hull's 'overhead' socket): under the
       * wheelhouse roof, just ahead of and above the helm (well above the windscreen
       * sightline); the centre of its face. The panel is a module: CONFIG.modules.overheadPanel.
       */
      overheadPanel: {
        position: [0, 3.27, -1.05] as [number, number, number],
      },
      /**
       * Where the crew whiteboard hangs (the hull's 'whiteboard' socket): inside the
       * wheelhouse on the aft wall, port of the door, facing forward (its centre). The board
       * is a module: CONFIG.modules.whiteboard.
       */
      whiteboard: { position: [-0.9, 2.5, 1.4] as [number, number, number] },
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
      // covers its depth). `lamp`: on a stalk fixed to the table (owner): its base by the wall
      // edge (`base` z), its height above the table, and its shade over the chart's middle
      // (`head` [x, z]); the lamp switch on the batten at its aft end ([x, z]).
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
       * Where the duty board hangs (the hull's 'dutyBoard' socket): on the starboard wall in
       * the aft half of the side window (behind the helm, where it blocks the least of the
       * view), facing inboard. The board is a module: CONFIG.modules.dutyBoard.
       */
      dutyBoard: { position: [1.355, 2.5, 0.78] as [number, number, number] },
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
        /**
         * The fire gauge on the console ahead of the joystick (fire/fireGauge.ts; owner:
         * better feedback): bar centre (vessel axes), bar length (m), and how far right of
         * the bar's end the ON TARGET lamp sits (m).
         */
        gauge: { position: [-0.66, 2.162, -1.52] as [number, number, number], length: 0.12, lampX: 0.05 },
        panLimitDeg: 170,
        tiltMinDeg: -10,
        tiltMaxDeg: 55,
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
     * The landing craft (modular boats M7): the hull study's `landingCraft` design (src/hulls/
     * designs.ts: her lines), lofted into the game's stations (vessel/hullForm.ts
     * hullFormFromDesign). A 9 m aluminium work boat with a square landing bow, a cabin aft
     * of amidships and an open foredeck; one small inboard diesel. Lofted upright at the deck
     * edge, her deck runs 10.2 m from transom to bow (the raked bow lengthens it); axes as
     * always: origin amidships at the DWL, z = +5.1 the transom, -5.1 the bow.
     * Here: her mass, handling, deck layout and where her modules go. Her machinery's
     * settings (the engine, propeller and rudder) are her recipe's (src/boats/landingCraft.json),
     * as any boat's modules' are.
     */
    landingCraft: {
      /**
       * kg, as weighed (engine and batteries in): the displacement of her stations at the
       * DWL (7.66 m3 of sea water), so she floats on her design waterline. CG: z = her LCB
       * (level trim), height about 0.45 m above the DWL (the cabin and the engine high in a
       * shallow hull). Radii of gyration as for the workboat: roll ~0.4 B, pitch / yaw ~0.25 L.
       */
      mass: 7850,
      /** Of which her engine with its gearbox (her recipe's diesel declares the same), at its bed. */
      engineKg: 800,
      cg: [0, 0.45, 1.025] as [number, number, number],
      gyradius: { roll: 1.1, pitch: 2.5, yaw: 2.6 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      /**
       * The workboat's per-area damping (it scales with her waterplane by itself); the angular
       * damping scaled to her size: roll ~30 % of critical (critical ~57 kN*m*s for 7.85 t,
       * GM ~1.1 m, I_roll from the gyradius), pitch and yaw likewise. Her linear surge term
       * (`surgeLinear`, a small drag for settling at rest) is a quarter of the workboat's: at
       * her 20 kn it would otherwise add ~4 kN on top of her resistance curve.
       */
      damping: { vertical: 1300, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 5, roll: 17000, pitch: 12000, yaw: 5000 },
      /**
       * As the workboat's curve, on her 8.8 m waterline: past the hump (Fn ~0.5, ~9 kn) the
       * wave term levels off at R/Delta = 0.115, about what a planing hull of her size needs,
       * so she can be driven to 20 kn (owner request; her 280 kW diesel and 0.6 m propeller in
       * her recipe). No planing lift is modelled yet: she doesn't rise or trim at speed.
       */
      resistance: { lwl: 8.8, formFactor: 0.2, waveA: 1.0, waveB: 0.94, waveKnee: 0.3, waveCap: 0.115, asternFactor: 3.6, y: -0.25 },
      /**
       * A planing hull banks into a turn (owner): sliding outward, the outer half of her vee
       * bottom lifts more than the inner, rolling her in against her CG's outward heel
       * (vessel/physics/vesselPhysics.ts). `bank` scales that lift pair, 1/2 rho Awp U v at
       * her chines; it fades in from Fn `fnStart` to `fnFull` (~5 to ~13 kn on her 8.8 m
       * waterline). Tuned: at 16 kn with the helm 40 % over she leans ~6 deg into the turn
       * (it was ~8 deg out); thrown hard over at 20 kn she leans in up to ~15 deg as she
       * carves round, then settles near upright as she slows (to ~9 kn: the hull's sideways
       * drag isn't a planing hull's yet).
       */
      planing: { bank: 0.06, fnStart: 0.3, fnFull: 0.7 },
      /** Side-on: hull ~10 x 1.2 m plus the cabin ~2.7 x 2.0; end-on 2.8 x 1.2 plus 2.1 x 2.0 (m2). */
      windage: { side: 17, front: 7.5, center: [0, 1.3, 0.6] as [number, number, number] },
      /**
       * Deck layout (as the workboat's: these numbers drive the drawn cabin and the walk
       * area). The cabin (the design's wheelhouse, aft of amidships) with 0.3 m side decks;
       * its roof walkable, by a ladder on its aft face. One bulwark height all round, 0.5 m
       * (the design's runs 0.32 m aft to 0.62 m forward: the game takes one height for now).
       */
      layout: {
        wheelhouse: {
          halfWidth: 1.05,
          front: 0.725,
          aft: 3.375,
          floorY: LC_FLOOR,
          roofY: 2.97,
          wall: 0.06,
          doorWidth: 0.7,
          /** Door and window heads raised with the floor lowered: the roof stays where it was. */
          doorHeight: 1.95,
          windowSill: 0.95,
          windowHead: 1.95,
          /** The front sill level with the dash top (console 0.9 + dash 0.41). */
          frontSill: 1.31,
          consoleDepth: 0.5,
          consoleHeight: 0.9,
        },
        roof: { thickness: 0.1, overhang: 0.15, railHeight: 0.6, edgeMargin: 0.25 },
        ladder: { x: 0.72, width: 0.4, depth: 0.45 },
        doorButtons: { x: 0.45, height: 1.1 },
        /** The engine under a hatch in the cabin floor, aft to starboard. */
        engineHatch: { x0: 0.15, x1: 0.85, z0: 2.25, z1: 3.05, pitDepth: 0.75 },
        /**
         * The bow ramp (her hull's own, not a module: controls/BowRamp.ts). A plate `width` x
         * `length` m hinged across the top of the bow plate. Raised, it leans forward at
         * `raisedDeg` above the horizontal and closes the bow in place of a bulwark; lowered,
         * it hangs `loweredDeg` below it, ready to put its lip on a beach. It takes
         * `travelSec` either way. Two hydraulic rams work it, one each side: their cylinders
         * pivot on posts `ram.aft` m aft of the hinge and `ram.height` m above the deck,
         * `ram.x` m off the centreline; their rods on lugs `ram.along` m up the ramp. Kept
         * short (top ~1 m above the deck raised) so the helm can still see the water ahead
         * over it: a longer ramp reaches a beach better and blinds the helm more.
         * Its push buttons are door-button modules bound to 'ramp.bow.down': one in the cabin
         * (places.rampButton), one on the inboard face of the port bulwark by the bow, at
         * `button.z`, `button.y` above the deck there.
         */
        bowRamp: {
          width: 1.9,
          length: 1.2,
          raisedDeg: 60,
          loweredDeg: -35,
          travelSec: 6,
          /**
           * Toe flaps (owner: to reach further): a row of `count` hinged fingers along its lip,
           * `length` m long, `gap` m apart. Folded back flat on the walking face while it's
           * raised, they flop over as it comes down (from `flopAt` of the way down) and hang
           * `hangDeg` below the horizontal, or lie on the slip when she's landed on one.
           */
          flap: { length: 0.7, count: 4, gap: 0.04, flopAt: 0.6, hangDeg: 75 },
          ram: { x: 0.98, aft: 1.0, height: 0.9, along: 0.8 },
          button: { z: -4.3, y: 0.42 },
        },
        bulwarkHeight: 0.5,
        railHeight: 0.9,
        fairleadGap: 0,
        deckEdgeMargin: 0.25,
        bodyRadius: BODY_RADIUS,
      },
      /** The open foredeck is her cargo deck: lashing points along both sides. */
      cargo: {
        maxPayloadKg: 2500,
        slots: 0,
        bowClear: 0.4,
        aftClear: 0.25,
        fixed: false,
      },
      /** At the helm, facing forward. */
      boardingSpot: [0, LC_FLOOR, 1.85] as [number, number, number],
      spawn: { x: 0, z: -22, dropHeight: 3, headingDeg: 90 },
      /** Wet exhaust through the transom, starboard of the centreline, and which way it blows. */
      exhaust: { position: [0.55, 0.2, 5.15] as [number, number, number], direction: [0, -0.12, 1] as [number, number, number] },
      /**
       * Her hand gear's places (vessel axes): the extinguisher and torch brackets on the
       * cabin's aft wall, port of the door; the binoculars on the dash top, port end.
       */
      stowage: {
        extinguisher: [-0.85, LC_FLOOR + 0.58, 3.225] as [number, number, number],
        torch: [-0.6, LC_FLOOR + 0.68, 3.255] as [number, number, number],
        binoculars: { at: [-0.7, LC_FLOOR + 1.35, 0.865] as [number, number, number], yawDeg: 20 },
      },
      /**
       * Where her modules go (vessel axes, m): the helm console's top at its aft face; the
       * breaker panel, battery master and selector, the VHF; the engine space under the
       * hatch; the rudder stock; the cabin lamp; the roof (searchlight, nav lights); her
       * cleats' stations, fore and aft.
       */
      places: {
        console: [0, LC_FLOOR + 0.9, 1.285] as [number, number, number],
        /** Its back against the starboard wall (the wall's inside face at x 0.99; the tilted panel reaches 0.12 m outboard of this point). */
        breakerPanel: [0.865, LC_FLOOR + 0.6, 1.6] as [number, number, number],
        /** The bow ramp's button in the cabin: the port wall by the helm (the breaker panel's mirror). */
        rampButton: [-0.98, LC_FLOOR + 0.73, 1.5] as [number, number, number],
        batteryMaster: [0.6, LC_FLOOR + 0.48, 3.31] as [number, number, number],
        batterySelector: [0.85, LC_FLOOR + 0.48, 3.31] as [number, number, number],
        vhf: [-0.75, 2.8, 1.25] as [number, number, number],
        /** The FM set, under the roof to starboard, the VHF's mirror. */
        fm: [0.5, 2.86, 1.25] as [number, number, number],
        engineBed: [0.5, LC_FLOOR - 0.35, 2.65] as [number, number, number],
        engineSpace: [-0.2, LC_FLOOR - 0.47, 2.65] as [number, number, number],
        rudder: [0, -0.3, 4.85] as [number, number, number],
        cabinLight: [0, 2.85, 2.2] as [number, number, number],
        searchlight: [0, 3.2, 1.0] as [number, number, number],
        navLights: [0, 3.07, 2.0] as [number, number, number],
        cleats: { bow: -4.6, stern: 4.7 },
      },
    },

    /**
     * The Alaskan 38 (owner, Oct 2026): a one-off boat built from a video of a custom
     * aluminium expedition / sport-fishing boat, designed afresh for the game in that spirit
     * (src/boats/alaskan38/design.ts: her lines; boats/alaskan38/view.ts: her one-off parts).
     * 11.6 m on the waterline; lofted, her deck runs 12.19 m from the transom (z = +6.09) to
     * the stem (z = -6.09), with twin outboards on a bracket off the transom. Built in stages:
     *   1  her hull, the bracket and outboards, spray rails and bow rail; a plain pilothouse
     *      standing in for her superstructure; she floats and drives;
     *   2  her superstructure (trunk cabin, raised pilothouse, saloon, cockpit overhead);
     *   3  her interior.
     * Here: her mass, handling, deck layout, and where her modules and her one-off parts go.
     * Her machinery's settings are her recipe's (src/boats/alaskan38.json).
     */
    alaskan38: {
      /**
       * kg, as weighed (engines and batteries in): the displacement of her stations at the
       * DWL, so she floats on her design waterline (tests/seaTrials.test.ts prints it:
       * `VESSEL=alaskan38 npm run trials`). CG: z = her LCB (level trim); height 0.55 m above
       * the DWL (a tall house, but the engines hang low aft and the tanks are in the bilge).
       * Radii of gyration: roll ~0.4 B, pitch / yaw ~0.25 L.
       */
      mass: 9230,
      /** Of which her two outboards (her recipe's outboard module declares the same, 2 x CONFIG.modules.outboard.massKg), on the bracket. */
      engineKg: 760,
      cg: [0, 0.55, 1.71] as [number, number, number],
      gyradius: { roll: 1.5, pitch: 3.0, yaw: 3.1 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      /**
       * As the landing craft's (per-area terms scale with her waterplane); the angular
       * damping scaled to her size: roll ~30 % of critical for 10 t with GM ~1.3 m and her
       * roll gyradius, pitch and yaw likewise.
       */
      damping: { vertical: 1300, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 5, roll: 30000, pitch: 25000, yaw: 10000 },
      /**
       * The landing craft's curve on her 11.6 m waterline, the wave term levelling off at
       * R/Delta = 0.13 past the hump (a deep vee runs a little harder than her flatter
       * bottom): with 2 x 300 kW on the bracket she makes about 30 kn. No planing lift is
       * modelled yet: she doesn't rise or trim at speed.
       */
      resistance: { lwl: 11.6, formFactor: 0.2, waveA: 1.0, waveB: 0.94, waveKnee: 0.3, waveCap: 0.13, asternFactor: 3.6, y: -0.3 },
      /** She banks into a turn as the landing craft does (a deeper vee: a little more). */
      planing: { bank: 0.07, fnStart: 0.3, fnFull: 0.7 },
      /** Side-on: hull ~12 x 1.3 m plus the house ~5.5 x 2.4; end-on 3.8 x 1.3 plus 3 x 2.4 (m2). */
      windage: { side: 30, front: 11, center: [0, 1.6, 0] as [number, number, number] },
      /**
       * Deck layout. The game's house box (`wheelhouse`) is her pilothouse and saloon
       * together, from the foredeck to the cockpit: it is what you walk in, where the aft
       * door hangs, where the rain lands on the glass and where her modules go. Its walls,
       * windows and roof are **her own geometry** (`shell: 'oneOff'`: boats/alaskan38/view.ts
       * draws them from this box and `house` below; the hull mesh draws only the floor and
       * console). Stage 2: one floor at the pilothouse's height (1.25 m above the DWL, a step
       * up from the cockpit deck); the sunk saloon floor and the raised helm come with the
       * interior, stage 3. The front: three facets, reverse-raked 12° (a pilothouse front keeps
       * sun and rain off the glass); the side glass from 0.9 m above the floor to 2.0 m, the
       * roof at 2.2 m. No roof ladder: her roof carries the radar and the rod rack.
       * The bulwarks 0.45 m round the cockpit (the game takes one height; the design's run
       * lower forward, where the bow rail stands).
       */
      layout: {
        wheelhouse: {
          halfWidth: 1.5,
          front: -2.8,
          aft: 2.7,
          /** The pilothouse floor (the helm's level); the saloon's is sunk (levels). */
          floorY: A38_FLOOR,
          /** The pilothouse roof; the saloon's is lower (house.saloon.roofY). */
          roofY: A38_FLOOR + 2.3,
          /** Pilothouse floor, a tread, the saloon floor (0.5 m down in two steps; the cockpit deck at the aft door is 1.02). */
          levels: [
            { z0: -2.8, z1: -0.5, y: A38_FLOOR },
            { z0: -0.5, z1: -0.2, y: A38_FLOOR - 0.25 },
            { z0: -0.2, z1: 2.7, y: A38_FLOOR - 0.5 },
          ],
          wall: 0.06,
          doorWidth: 0.75,
          doorHeight: 1.95,
          /** The pilothouse's side glass, above its floor (the saloon's: house.saloon). */
          windowSill: 0.85,
          windowHead: 2.05,
          /** The front sill level with the dash top (console 0.9 + dash 0.41). */
          frontSill: 1.31,
          /** Reverse-raked (leaning forward at the top), as a pilothouse front. */
          frontRakeDeg: 12,
          consoleDepth: 0.5,
          consoleHeight: 0.9,
          shape: { lowerRakeDeg: 0, lowerFromY: A38_FLOOR, roofEdgeDeg: 20, visor: 0.3, facet: { centre: 0.5, depth: 0.4 } },
          shell: 'oneOff' as const,
          /** The companionway opening, to port, forward (the treads: layout.extraFloors). */
          floorHoles: [{ x0: -1.24, x1: -0.42, z0: -2.78, z1: -1.9 }],
        },
        roof: { thickness: 0.1, overhang: 0.12, railHeight: 0, edgeMargin: 0.25 },
        /** The aft door's buttons: 1.1 m above the saloon floor at the door (0.5 m below the helm's floor, which this is measured from). */
        doorButtons: { x: 0.5, height: 0.6 },
        /** The engine space is a lazarette under the cockpit deck aft, to starboard (the outboards' fuel and batteries; a hatch in the deck). */
        engineHatch: { x0: 0.2, x1: 1.0, z0: 4.6, z1: 5.4, pitDepth: 0.6 },
        bulwarkHeight: 0.45,
        railHeight: 0,
        fairleadGap: 0,
        deckEdgeMargin: 0.25,
        bodyRadius: BODY_RADIUS,
        /**
         * Below the pilothouse: the companionway down to port of the helm (three treads,
         * 0.31 m each, running forward under the dash) and the fore cabin's sole, 0.8 m wide
         * between the berth fronts, with standing headroom under the trunk cabin. Walked
         * (layout.ts); drawn by view.ts from `house.interior`.
         */
        extraFloors: [
          { x0: -1.2, x1: -0.42, z0: -2.2, z1: -1.9, y: 0.94 },
          { x0: -1.2, x1: -0.42, z0: -2.5, z1: -2.2, y: 0.63 },
          { x0: -1.2, x1: -0.42, z0: -2.8, z1: -2.5, y: 0.31 },
          { x0: -0.95, x1: 0.25, z0: -3.3, z1: -2.78, y: 0 },
          { x0: -0.5, x1: 0.25, z0: -4.0, z1: -3.3, y: 0 },
          /** The trunk cabin's top (nearly level: the deck rises as the trunk lowers), stepped onto from the side decks forward. */
          { x0: -0.85, x1: 0.85, z0: -4.6, z1: -2.9, y: 1.82 },
        ],
        /** The companionway (up through the pilothouse floor) and the fore cabin (under the trunk and the pilothouse floor): open space. */
        hollows: [
          { x0: -1.24, x1: -0.42, y0: -0.1, y1: 2.4, z0: -2.78, z1: -1.9 },
          { x0: -1.4, x1: 1.4, y0: -0.1, y1: 1.9, z0: -5.0, z1: -2.78 },
        ],
        /** No deck under the trunk cabin (the fore cabin is open up into it), the side decks 0.32 m wide beside it. */
        deckOpening: { front: -4.85, inset: 0.32 },
      },
      /**
       * Her superstructure's own parts (boats/alaskan38/view.ts; drawing only; m, vessel
       * axes), round the house box above. Two roof levels, as the boat has: the pilothouse
       * stands high forward; the saloon's lower roof runs aft from it and on over the
       * cockpit as the overhead.
       *   pilothouseAft  the pilothouse's aft wall (the step down into the saloon starts here);
       *                  above the saloon roof it carries a band of aft-facing glass
       *   sideDoor       the sliding door in the pilothouse's starboard side (drawn shut);
       *   saloon         its roof's height; its side glass above its floor (sill, head);
       *   trunk          the trunk cabin on the foredeck, from the house front forward to
       *                  `fwd`: `inset` in from the deck edge, `height` above the deck at the
       *                  house, `fwdHeight` at its forward end (it tapers), a glass hatch;
       *   eyebrow        each roof slab (tan: the eyebrow) reaches `visor` ahead of the front
       *                  glass and `sideOverhang` past the walls;
       *   overhead       the saloon roof carried aft over the cockpit to `aft`, the hull's
       *                  width (`halfWidth`), on a curved wing each side (the house's side
       *                  carried aft, sweeping from the deck at `kneeFoot` up to the roof's
       *                  aft edge), with a pair of grab handles on each wing;
       *   radar, rodRack the radar dome on its pedestal behind the pilothouse, the rod rack
       *                  along the overhead's aft edge;
       *   roofRail       grab rails along the saloon roof's sides (for the tender).
       */
      house: {
        pilothouseAft: -0.5,
        sideDoor: { z0: -1.45, z1: -0.7 },
        saloon: { roofY: A38_FLOOR - 0.5 + 2.2, sill: 1.0, head: 2.0 },
        trunk: { fwd: -4.9, height: 0.4, fwdHeight: 0.2, inset: 0.3, hatch: { z: -4.05, size: 0.55 } },
        eyebrow: { visor: 0.3, sideOverhang: 0.12 },
        overhead: { aft: 4.6, halfWidth: 1.78, kneeFoot: 3.4 },
        radar: { z: -0.15, radius: 0.3, height: 0.22, pedestal: 0.5 },
        rodRack: { z: 4.45, halfWidth: 0.9, height: 0.55, rods: 6 },
        roofRail: { height: 0.25, spacing: 1.2 },
        /**
         * Inside (stage 3; drawing only, the walking is layout.extraFloors / hollows):
         *   console        the console body, to starboard of the companionway (the console
         *                  module's dash sits on it: places.console, x 0.5); x0 is its port end
         *   seats          the helm seat and a companion's, on pedestals behind the console
         *   companionway   the opening's bounds, the handrail
         *   foreCabin      the sole, the V-berth's platform and cushions, a hanging locker
         *                  under the pilothouse floor to starboard, the lining's colours
         *   galley         the counter along the saloon's starboard side: sink, stove, fridge
         *   dinette        the settees round the table (the table is the chart-table module,
         *                  places.chartTable) along the saloon's port side
         *   ceiling        the lining under each roof, set in from the walls
         */
        interior: {
          console: { x0: -0.4, colour: 0x3c4248 },
          seats: [
            { x: 0.5, z: -0.95 },
            { x: -0.85, z: -0.95 },
          ],
          companionway: { x0: -1.24, x1: -0.42, z0: -2.78, z1: -1.9, rail: { x: -0.44, height: 0.9 } },
          foreCabin: { sole: 0, berth: { aft: -3.75, top: 0.55, cushion: 0.12 }, locker: { x0: 0.35, x1: 1.05, z0: -3.6, z1: -2.82, top: 1.1 }, lining: 0xd8d2c4, trim: 0x8a5d3c, cushion: 0x2b3a55 },
          galley: { x0: 0.85, z0: 0.0, z1: 2.5, top: 0.9, sink: [1.15, 0.5] as [number, number], stove: [1.15, 1.3] as [number, number], fridge: [1.9, 2.4] as [number, number] },
          dinette: { x1: -0.95, seat: 0.45, back: 0.9, fwd: [-0.15, 0.55] as [number, number], aft: [1.6, 2.4] as [number, number] },
          ceiling: { inset: 0.12, thickness: 0.02, colour: 0xeeece6 },
        },
      },
      /** The cockpit is her working deck: lashing points along both sides. */
      cargo: {
        maxPayloadKg: 1200,
        slots: 0,
        bowClear: 0.4,
        aftClear: 0.4,
        fixed: false,
      },
      /** At the helm, facing forward. */
      boardingSpot: [0.5, A38_FLOOR, -1.3] as [number, number, number],
      spawn: { x: 0, z: -22, dropHeight: 3, headingDeg: 90 },
      /** The outboards' exhaust: out through their lower units, under water at the bracket (seen as a little spray astern). */
      exhaust: { position: [0.5, 0.0, 7.6] as [number, number, number], direction: [0, -0.1, 1] as [number, number, number] },
      /** Her hand gear: the extinguisher and torch brackets on the house's aft wall, port of the door; the binoculars on the dash top, port end. */
      stowage: {
        extinguisher: [-0.95, A38_FLOOR + 0.08, 2.55] as [number, number, number],
        torch: [-0.7, A38_FLOOR + 0.18, 2.575] as [number, number, number],
        binoculars: { at: [-0.25, A38_FLOOR + 1.35, -2.26] as [number, number, number], yawDeg: 20 },
      },
      /**
       * Where her modules go (vessel axes, m): the console behind the faceted front; the
       * breaker panel, battery master and selector, the radios; the lazarette; the cabin
       * lamp; the roof; her cleats' stations. (Her outboards: the outboard module on the
       * bracket, `bracket.mountY` and its aft face.)
       */
      places: {
        /** The console's dash (the module), to starboard of the companionway: x 0.5, 0.9 m each way (its body: house.interior.console). */
        console: [0.5, A38_FLOOR + 0.9, -1.84] as [number, number, number],
        /** On the starboard wall by the helm, set back with the facet there. */
        breakerPanel: [1.315, A38_FLOOR + 0.6, -1.5] as [number, number, number],
        /** On the aft wall, above the saloon floor (0.5 m below the helm's). */
        batteryMaster: [1.05, A38_FLOOR - 0.02, 2.635] as [number, number, number],
        batterySelector: [1.3, A38_FLOOR - 0.02, 2.635] as [number, number, number],
        vhf: [-1.2, A38_FLOOR + 2.13, -1.9] as [number, number, number],
        fm: [1.15, A38_FLOOR + 2.19, -1.4] as [number, number, number],
        /** The lazarette: her fuel, batteries and pump. */
        engineSpace: [-0.2, 0.5, 5.0] as [number, number, number],
        /** The saloon ceiling (its roof is the lower one). */
        cabinLight: [0, A38_FLOOR + 1.6, 1.2] as [number, number, number],
        searchlight: [0, A38_FLOOR + 2.4, -2.4] as [number, number, number],
        navLights: [0, A38_FLOOR + 2.37, -1.0] as [number, number, number],
        cleats: { bow: -5.3, stern: 5.6 },
        /** The dinette table is the chart-table module (its drop leaf against the port wall): its forward inboard corner on the saloon floor. */
        chartTable: [-1.37, A38_FLOOR - 0.5, 0.6] as [number, number, number],
        /** The crew whiteboard on the saloon's aft wall, port of the door; the duty board on its starboard wall over the galley. */
        whiteboard: [-1.0, A38_FLOOR + 1.15, 2.635] as [number, number, number],
        dutyBoard: [1.435, A38_FLOOR + 1.1, 1.3] as [number, number, number],
      },
      /**
       * Her one-off parts (boats/alaskan38/view.ts; drawing only). The outboard bracket: a
       * welded box off the transom, `bottom` to `top` m above the DWL, `length` m long, its
       * top the swim platform with a rail `railHeight` high; a gate in the transom at `gateX`
       * with steps down. Her two outboards (the outboard module, propulsion.outboard: its
       * figures CONFIG.modules.outboard) clamp to its aft face at +-`outboardX`, the mount's
       * top (their cowls' undersides) `mountY` above the DWL.
       */
      bracket: { halfWidth: 1.55, bottom: 0.0, top: 0.45, length: 0.95, gateX: 0, railHeight: 0.9, outboardX: 0.5, mountY: 0.7 },
      /** Two spray rails along the topsides, at these shares of the way from the chine up to the deck edge, standing `proud` m. */
      sprayRails: { shares: [0.3, 0.6], proud: 0.06, radius: 0.035, colour: 0x8a9096 },
      /** The bow rail: posts on the deck edge from `from` (z) to the stem every `spacing` m, `height` m above the bulwark. */
      bowRail: { from: -3.1, spacing: 0.7, height: 0.75 },
      /** Her tinted glass (a second, see-through mesh): its colour and how dark (0 clear, 1 opaque). Dark from outside over her unlit interior; a light tint looking out. */
      glass: { colour: 0x0e1a22, opacity: 0.3 },
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
        bodyRadius: BODY_RADIUS,
      },
      /**
       * Cargo in her bottom between the bow (`bowClear`) and the helmsman's place by the
       * tiller (`aftClear`), kept `edge` m inside her thin aluminium sides (owner: she should
       * carry more). Her floor there is about 2.6 m² (2.1 m long, 1.2-1.4 m wide inside), which
       * takes five crates side by side, one deep (cargo/deck.ts deckCapacity; a crate's
       * 0.6 × 0.5 m stands in 0.6 m square), or two oil drums: no slot limit, just room and
       * mass. `maxPayloadKg` 300: five crates (200 kg), or two drums and a crate, with her
       * helmsman sink her about 10 cm (her waterplane ~3.8 m², ~39 kg/cm), leaving ~0.2 m of
       * freeboard aft. Sitting low, wedged in, it doesn't slide about (`fixed`), and she has
       * no D-rings.
       */
      cargo: {
        maxPayloadKg: 300,
        slots: 0,
        bowClear: 0.6,
        aftClear: 0.9,
        edge: 0.08,
        fixed: true,
      },
      /**
       * Her cleats (modules/boatCleat; owner: tie her up front and back, to the ship or the
       * quay): the bow cleat on her stem head, the stern cleat on the port quarter's coaming
       * (clear of the outboard), each socket the cleat's base (x, y, z); the line pulls from
       * `lineY` above it. Moored at a quay berth she lies `inshore` m closer to the quay than
       * the berth's mark, which is set for the workboat's beam (her half beam 0.8 m and a
       * little air, against the workboat's 2.1 m and fenders).
       */
      cleats: {
        bow: [0, 0.444375, -1.55] as [number, number, number],
        stern: [-0.74, 0.45, 1.6] as [number, number, number],
        lineY: 0.06,
        inshore: 1.4,
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
     * physics as everything else, floated on fewer stations than they're drawn with
     * (`hull.physicsStations`, owner: nobody watches a tow that closely; each station samples
     * the sea three times a tick, so 15-18 samples instead of 33). Masses are what their hulls displace at the DWL and the
     * CG is over the LCB, so they float level (tests/tow.test.ts checks). Angular damping
     * is scaled from the workboat's and the skiff's by mass x size^2.
     * `tow.look` picks the model drawn over the hull (tow/towLook.ts).
     */
    derelict: {
      tow: { look: 'derelict' as const, name: 'a motor cruiser with engine failure', size: 'small' as const },
      hull: { length: 7, beamDeck: 2.5, beamChine: 2.1, keelY: -0.45, chineYAft: -0.15, chineYBow: 0.15, deckYAft: 0.7, deckYBow: 1.0, stations: 11, physicsStations: 6, deckParallel: 0.5 },
      mass: DERELICT_MASS,
      cg: [0, 0.25, DERELICT_LCB] as [number, number, number],
      gyradius: { roll: 0.9, pitch: 1.8, yaw: 1.9 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      damping: { vertical: 800, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 20, roll: 2000, pitch: 2500, yaw: 2500 },
      resistance: { lwl: 6.5, formFactor: 0.25, waveA: 1.5, waveB: 1.2, waveKnee: 0.28, waveCap: 0.15, asternFactor: 2.0, y: -0.2 },
      layout: { bulwarkHeight: 0.25, railHeight: 0, deckEdgeMargin: 0.15, bodyRadius: BODY_RADIUS },
      cargo: { maxPayloadKg: 0, slots: 0, bowClear: 0.6, aftClear: 0.6, fixed: true },
      windage: { side: 9, front: 4, center: [0, 1.1, 0] as [number, number, number] },
      boardingSpot: [0, 0.75, 2] as [number, number, number],
      spawn: { x: 0, z: 0, dropHeight: 0.2, headingDeg: 0 },
    },
    logRaft: {
      tow: { look: 'logs' as const, name: 'a raft of logs broken loose from a timber tow', size: 'medium' as const },
      hull: { length: 8, beamDeck: 3.0, beamChine: 2.9, keelY: -0.45, chineYAft: -0.3, chineYBow: -0.15, deckYAft: 0.2, deckYBow: 0.3, stations: 11, physicsStations: 5, deckParallel: 0.85 },
      mass: LOGRAFT_MASS,
      cg: [0, -0.1, LOGRAFT_LCB] as [number, number, number],
      gyradius: { roll: 1.0, pitch: 2.2, yaw: 2.3 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      damping: { vertical: 800, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 20, roll: 7000, pitch: 7000, yaw: 7000 },
      resistance: { lwl: 7.8, formFactor: 0.8, waveA: 4, waveB: 3, waveKnee: 0.2, waveCap: 0.3, asternFactor: 1.5, y: -0.2 },
      layout: { bulwarkHeight: 0, railHeight: 0, deckEdgeMargin: 0.15, bodyRadius: BODY_RADIUS },
      cargo: { maxPayloadKg: 0, slots: 0, bowClear: 0.6, aftClear: 0.6, fixed: true },
      windage: { side: 2, front: 1.2, center: [0, 0.3, 0] as [number, number, number] },
      boardingSpot: [0, 0.3, 1] as [number, number, number],
      spawn: { x: 0, z: 0, dropHeight: 0.2, headingDeg: 0 },
    },
    /**
     * A fish-farm cage section torn from its moorings (the regions' jobs): a ring of floats
     * with its net hanging under it. Floats as the log raft does (the same hull numbers, so
     * the same mass and trim); drawn as the ring (tow/towLook.ts 'cage').
     */
    cage: {
      tow: { look: 'cage' as const, name: 'a fish-farm cage section torn from its moorings', size: 'medium' as const },
      hull: { length: 8, beamDeck: 3.0, beamChine: 2.9, keelY: -0.45, chineYAft: -0.3, chineYBow: -0.15, deckYAft: 0.2, deckYBow: 0.3, stations: 11, physicsStations: 5, deckParallel: 0.85 },
      mass: LOGRAFT_MASS,
      cg: [0, -0.1, LOGRAFT_LCB] as [number, number, number],
      gyradius: { roll: 1.0, pitch: 2.2, yaw: 2.3 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      damping: { vertical: 800, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 20, roll: 7000, pitch: 7000, yaw: 7000 },
      // The net under it drags: a form factor well above the raft's.
      resistance: { lwl: 7.8, formFactor: 1.6, waveA: 4, waveB: 3, waveKnee: 0.2, waveCap: 0.3, asternFactor: 1.5, y: -0.2 },
      layout: { bulwarkHeight: 0, railHeight: 0, deckEdgeMargin: 0.15, bodyRadius: BODY_RADIUS },
      cargo: { maxPayloadKg: 0, slots: 0, bowClear: 0.6, aftClear: 0.6, fixed: true },
      windage: { side: 1.5, front: 1.5, center: [0, 0.4, 0] as [number, number, number] },
      boardingSpot: [0, 0.3, 1] as [number, number, number],
      spawn: { x: 0, z: 0, dropHeight: 0.2, headingDeg: 0 },
    },
    barge: {
      tow: { look: 'barge' as const, name: 'a work barge adrift from her moorings', size: 'medium' as const },
      hull: { length: 9, beamDeck: 3.6, beamChine: 3.4, keelY: -0.55, chineYAft: -0.45, chineYBow: -0.15, deckYAft: 0.5, deckYBow: 0.6, stations: 11, physicsStations: 5, deckParallel: 0.85 },
      mass: BARGE_MASS,
      cg: [0, 0.1, BARGE_LCB] as [number, number, number],
      gyradius: { roll: 1.2, pitch: 2.5, yaw: 2.6 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      damping: { vertical: 800, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 20, roll: 10000, pitch: 10000, yaw: 10000 },
      resistance: { lwl: 8.7, formFactor: 0.6, waveA: 3, waveB: 2.5, waveKnee: 0.22, waveCap: 0.25, asternFactor: 1.5, y: -0.25 },
      layout: { bulwarkHeight: 0.1, railHeight: 0, deckEdgeMargin: 0.15, bodyRadius: BODY_RADIUS },
      cargo: { maxPayloadKg: 0, slots: 0, bowClear: 0.6, aftClear: 0.6, fixed: true },
      windage: { side: 5, front: 3, center: [0, 0.8, 0] as [number, number, number] },
      boardingSpot: [0, 0.55, 1] as [number, number, number],
      spawn: { x: 0, z: 0, dropHeight: 0.2, headingDeg: 0 },
    },
    /**
     * More things to tow, small to large (owner: to test the Shipyard's more powerful boats).
     * As the three above: masses are what the physics stations displace at the DWL, the CG
     * over the LCB; angular damping scaled from the workboat's by mass x size^2 (roll by
     * the beam, pitch and yaw by the length). The large ones pass you their own heavy hawser
     * (`tow.lineFactor`: the line parts at that many times CONFIG.tow.breakForce).
     */
    dory: {
      tow: { look: 'dory' as const, name: 'an open fishing boat with a fouled propeller', size: 'small' as const },
      hull: { length: 5.5, beamDeck: 2.0, beamChine: 1.7, keelY: -0.35, chineYAft: -0.1, chineYBow: 0.15, deckYAft: 0.5, deckYBow: 0.75, stations: 9, physicsStations: 4, deckParallel: 0.45 },
      mass: DORY_MASS,
      cg: [0, 0.1, DORY_LCB] as [number, number, number],
      gyradius: { roll: 0.7, pitch: 1.4, yaw: 1.45 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      damping: { vertical: 800, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 20, roll: 950, pitch: 600, yaw: 300 },
      resistance: { lwl: 5.2, formFactor: 0.25, waveA: 1.5, waveB: 1.2, waveKnee: 0.28, waveCap: 0.15, asternFactor: 2.0, y: -0.15 },
      layout: { bulwarkHeight: 0.15, railHeight: 0, deckEdgeMargin: 0.12, bodyRadius: BODY_RADIUS },
      cargo: { maxPayloadKg: 0, slots: 0, bowClear: 0.6, aftClear: 0.6, fixed: true },
      windage: { side: 3, front: 1.5, center: [0, 0.5, 0] as [number, number, number] },
      boardingSpot: [0, 0.45, 1] as [number, number, number],
      spawn: { x: 0, z: 0, dropHeight: 0.2, headingDeg: 0 },
    },
    yacht: {
      tow: { look: 'yacht' as const, name: 'a sailing yacht, dismasted', size: 'medium' as const },
      hull: { length: 11, beamDeck: 3.5, beamChine: 2.6, keelY: -1.1, chineYAft: -0.1, chineYBow: 0.25, deckYAft: 0.8, deckYBow: 1.2, stations: 11, physicsStations: 5, deckParallel: 0.4 },
      mass: YACHT_MASS,
      // Low: her ballast keel.
      cg: [0, -0.3, YACHT_LCB] as [number, number, number],
      gyradius: { roll: 1.25, pitch: 2.75, yaw: 2.85 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      damping: { vertical: 800, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 20, roll: 24000, pitch: 20000, yaw: 10000 },
      resistance: { lwl: 10.2, formFactor: 0.15, waveA: 1.0, waveB: 0.9, waveKnee: 0.3, waveCap: 0.12, asternFactor: 2.5, y: -0.4 },
      layout: { bulwarkHeight: 0.06, railHeight: 0, deckEdgeMargin: 0.15, bodyRadius: BODY_RADIUS },
      cargo: { maxPayloadKg: 0, slots: 0, bowClear: 0.6, aftClear: 0.6, fixed: true },
      windage: { side: 12, front: 5, center: [0, 1.2, 0] as [number, number, number] },
      boardingSpot: [0, 0.9, 2.5] as [number, number, number],
      spawn: { x: 0, z: 0, dropHeight: 0.2, headingDeg: 0 },
    },
    trawler: {
      tow: { look: 'trawler' as const, name: 'a fishing trawler with her nets round her propeller', size: 'large' as const, lineFactor: 2 },
      hull: { length: 18, beamDeck: 6.0, beamChine: 5.0, keelY: -1.8, chineYAft: -0.6, chineYBow: 0.4, deckYAft: 1.3, deckYBow: 2.2, stations: 13, physicsStations: 6, deckParallel: 0.55 },
      mass: TRAWLER_MASS,
      cg: [0, 0.3, TRAWLER_LCB] as [number, number, number],
      gyradius: { roll: 2.2, pitch: 4.5, yaw: 4.7 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      damping: { vertical: 800, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 20, roll: 460000, pitch: 345000, yaw: 172000 },
      // Her nets round the propeller and the locked shaft drag (the form factor, ~3x a clean hull's).
      resistance: { lwl: 17, formFactor: 1.0, waveA: 1.2, waveB: 1.0, waveKnee: 0.28, waveCap: 0.15, asternFactor: 2.0, y: -0.8 },
      layout: { bulwarkHeight: 0.8, railHeight: 0, deckEdgeMargin: 0.2, bodyRadius: BODY_RADIUS },
      cargo: { maxPayloadKg: 0, slots: 0, bowClear: 0.6, aftClear: 0.6, fixed: true },
      windage: { side: 55, front: 25, center: [0, 3, 0] as [number, number, number] },
      boardingSpot: [0, 1.4, 6] as [number, number, number],
      spawn: { x: 0, z: 0, dropHeight: 0.2, headingDeg: 0 },
    },
    pontoon: {
      tow: { look: 'pontoon' as const, name: 'a crane pontoon broken from her tug', size: 'large' as const, lineFactor: 2 },
      hull: { length: 20, beamDeck: 8.0, beamChine: 7.9, keelY: -1.2, chineYAft: -1.1, chineYBow: -0.6, deckYAft: 0.9, deckYBow: 1.0, stations: 9, physicsStations: 5, deckParallel: 0.85 },
      mass: PONTOON_MASS,
      cg: [0, -0.2, PONTOON_LCB] as [number, number, number],
      gyradius: { roll: 2.8, pitch: 5.0, yaw: 5.4 },
      addedMass: { surge: 0.05, sway: 0.4, heave: 0.6, roll: 0.25, pitch: 0.6, yaw: 0.3 },
      damping: { vertical: 800, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 20, roll: 1430000, pitch: 750000, yaw: 375000 },
      // Bluff, square-ended: a big form factor and an early wave rise.
      resistance: { lwl: 19.5, formFactor: 2.5, waveA: 4, waveB: 3.5, waveKnee: 0.15, waveCap: 0.3, asternFactor: 1.5, y: -0.5 },
      layout: { bulwarkHeight: 0.1, railHeight: 0, deckEdgeMargin: 0.2, bodyRadius: BODY_RADIUS },
      cargo: { maxPayloadKg: 0, slots: 0, bowClear: 0.6, aftClear: 0.6, fixed: true },
      windage: { side: 45, front: 20, center: [0, 2.5, 0] as [number, number, number] },
      boardingSpot: [0, 1.0, 4] as [number, number, number],
      spawn: { x: 0, z: 0, dropHeight: 0.2, headingDeg: 0 },
    },
    /**
     * A tug's tow (owner, Oct 2026): a loaded coaster, 58 m and 1,400 t, her engine dead. Only
     * offered to a tug (tow/tow.ts isTugClass); she passes her own heavy hawser (lineFactor
     * 3). Her mass is what the workboat can't shift in any useful time: a tug's pull is.
     */
    coaster: {
      tow: { look: 'coaster' as const, name: 'a loaded coaster with her engine dead', size: 'ship' as const, lineFactor: 3, needs: 'tug' as const },
      hull: { length: 58, beamDeck: 10.5, beamChine: 9.8, keelY: -3.4, chineYAft: -2.2, chineYBow: -0.4, deckYAft: 3.2, deckYBow: 4.6, stations: 15, physicsStations: 7, deckParallel: 0.6 },
      mass: COASTER_MASS,
      cg: [0, 0.4, COASTER_LCB] as [number, number, number],
      gyradius: { roll: 3.8, pitch: 14.5, yaw: 15 },
      addedMass: { surge: 0.05, sway: 0.5, heave: 0.8, roll: 0.3, pitch: 0.7, yaw: 0.4 },
      damping: { vertical: 800, verticalCd: 1.5, lateralLinear: 400, lateralLift: 1.2, lateralCd: 1.0, surgeLinear: 20, roll: 30000000, pitch: 60000000, yaw: 30000000 },
      // A full, slow hull with a locked propeller: a big form factor, waves from low speed.
      resistance: { lwl: 56, formFactor: 0.6, waveA: 1.2, waveB: 1.0, waveKnee: 0.22, waveCap: 0.15, asternFactor: 2.0, y: -1.6 },
      layout: { bulwarkHeight: 1.0, railHeight: 0, deckEdgeMargin: 0.3, bodyRadius: BODY_RADIUS },
      cargo: { maxPayloadKg: 0, slots: 0, bowClear: 0.6, aftClear: 0.6, fixed: true },
      windage: { side: 220, front: 60, center: [0, 5, 0] as [number, number, number] },
      boardingSpot: [0, 3.4, 15] as [number, number, number],
      spawn: { x: 0, z: 0, dropHeight: 0.2, headingDeg: 0 },
    },
  },

  /**
   * Docking: inside a berth's hot spot (close, slow, roughly lined up either way round),
   * making the lines fast at the cleats warps the boat in and the lines then hold her
   * alongside. They are horizontal spring-dampers at bow and stern towards the berth, so
   * she still heaves and rolls.
   */
  /**
   * Landing on a slipway (world/slipway.ts; owner, Oct 2026), for a boat with a bow ramp:
   * her ramp down (or going down), lined up with the slip within `maxAngleDeg`, slower than
   * `maxSpeed` m/s, her middle within `range` m (in plan) of where she'd lie landed and
   * `across` m of its centreline: she's drawn up onto it at `landSpeed` m/s (taking at least
   * `landSec` s) and held there,
   * the waves no longer moving her. The lever `releaseLever` astern or more takes her off.
   * Landed, she lies level at her waterline, as far up the slip as her bottom allows (it
   * just touches the concrete); her ramp's toe flaps (`layout.bowRamp.flap`) rest on it.
   */
  slipway: { maxAngleDeg: 20, maxSpeed: 1.0, range: 4, across: 1.5, landSec: 2, landSpeed: 0.8, releaseLever: -0.25 },

  /**
   * The handheld fishing rod (owner, Oct 2026; fishing/rodGame.ts, modules/rodRack): a rod on
   * a rack on the wheelhouse's aft wall (a Shipyard fitting), a bucket on deck under it.
   * Take the rod, cast (trigger / click) over the side, wait; a fish bites (the float dips,
   * the rod buzzes): strike within `biteWindow` s, then play it: hold to reel (the line's
   * tension rises, the fish comes in), let go to rest it (the tension falls). Over 1 the line
   * parts. Landed at `landAt` m, it goes in the bucket; tied up at a port the bucket is sold.
   *   castRange     how far the float flies (m, along the rod, level)
   *   maxSpeed      the boat must be slower than this to fish (m/s)
   *   wait          seconds to a bite in open water (range); in a fishing ground divided by
   *                 (1 + richness × groundFactor)
   *   biteWindow    seconds to strike once it bites
   *   reelRate      line in per second while reeling (m/s), less as the fish pulls
   *   tensionUp     how fast the tension rises while reeling, per unit of the fish's pull
   *   tensionDown   how fast it falls resting (per s)
   *   fightPeriod   the fish's runs (s): its pull swings between calm and full
   *   pullPerKg     a fish's full pull in tension per kg (a 2 kg fish at 0.9 breaks the line if you don't rest it)
   *   landAt        the float this close (m) and the fish is in
   *   perRack, spacing   rods on a rack (each one usable: the crew fish together), standing
   *                 upright this far apart along the wall (m); their tips reach above the roof
   *   takeGrace     seconds after taking a rod before a press counts (so the grab isn't a cast)
   *   bucketMax     fish the bucket holds
   *   pricePerKg    what the merchant pays (GBP), times the port's fish factor
   *   species       what bites where: the coast's own mix, and each fishing ground's own
   *                 species (FishingGroundDef.species) when you're in one; kg ranges
   */
  rod: {
    castRange: 12,
    maxSpeed: 1.5,
    wait: [10, 35] as [number, number],
    groundFactor: 1.5,
    biteWindow: 2.5,
    reelRate: 1.4,
    tensionUp: 0.9,
    tensionDown: 1.2,
    fightPeriod: 3.2,
    pullPerKg: 0.42,
    landAt: 1.5,
    perRack: 4,
    spacing: 0.24,
    takeGrace: 0.5,
    bucketMax: 12,
    pricePerKg: 5.5,
    species: {
      coast: ['mackerel', 'pollack', 'wrasse', 'mackerel', 'coalfish'] as string[],
      kg: { mackerel: [0.3, 1.1], pollack: [0.6, 3.5], wrasse: [0.4, 1.6], coalfish: [0.5, 2.8], haddock: [0.7, 2.4], herring: [0.2, 0.5], cod: [1.0, 6.0] } as Record<string, [number, number]>,
    },
  },

  /**
   * A Kort nozzle (owner, Oct 2026; the Shipyard's choice on a shaft-driven inboard): a duct
   * round the propeller. Ducting a heavily loaded propeller lets the duct itself carry part of
   * the thrust, so at a standstill (bollard pull) she pulls harder for the same power; at
   * speed the duct's own drag takes it back, so she's slower free-running. A rudder in the
   * nozzle's concentrated jet answers better at low speed and astern (vessel/physics/
   * propulsion.ts: propellerForces and rudderForceAt).
   *   thrustGain   bollard thrust (K_T at J 0) times this
   *   jFactor      the thrust's fall with advance (j0) times this: it drops off sooner
   *   torqueGain   the torque absorbed times this (the duct loads the propeller a little more)
   *   asternGain   astern thrust times this (a nozzle backs poorly: its flow is the wrong way round)
   *   steerGain    the rudder's slipstream force (washFactor and its cap) times this
   *   asternSteer  astern, the share of that the rudder gets from the propeller drawing its
   *                water in past it through the duct (owner: it "hardly steers at all"
   *                backwards; tuned on the small tug to turn about half as hard astern as
   *                ahead at the same throttle, as nozzle-and-rudder tugs do)
   *   price        GBP, in the Shipyard
   */
  nozzle: { thrustGain: 1.3, jFactor: 0.75, torqueGain: 1.08, asternGain: 0.85, steerGain: 1.5, asternSteer: 0.9, price: 12000 },

  docking: {
    /**
     * Lying at a berth: the berth marks (BerthDef.shoreDist, 2.5 m off the face) are set for
     * the workboat's beam (her widest deck half-beam, 2.3 m, plus this much air for her
     * fenders). Any boat lies with her own half-beam plus this off the face
     * (vessel/physics/mooring.ts berthInshore), so a broad tug lies further off and a narrow
     * boat closer, instead of into the quay (owner, Oct 2026: the big tug spawned into it).
     */
    fenderClear: 0.2,
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
    /** The open-water calls' mix; a region's own job list (RegionDef.jobs) replaces it there. The cage section comes only from a region's list. */
    weights: { derelict: 1, dory: 0.8, logRaft: 1, barge: 0.7, yacht: 0.8, trawler: 0.5, pontoon: 0.4, cage: 0, coaster: 0 } as Record<string, number>,
    /**
     * A tug's work (owner, Oct 2026): a boat that's tug class (isTugClass: her engine's rated
     * speed at or under `tugRpm`, the slow-revving tug diesel; or the heavy towing post) gets
     * the big tows (`tow.needs` 'tug': the coaster) `bigShare` of the time, from `bigWeights`.
     * Other boats never hear those calls.
     */
    tugRpm: 1200,
    bigShare: 0.5,
    bigWeights: { coaster: 1 } as Record<string, number>,
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
    /**
     * The TOW LINE screen (owner, Oct 2026: "how close it is to snapping"): its load bar is the
     * nearer of the tension to its breaking force and the stretch to `maxStretch`. The highest
     * load is held `peakHoldS` s (a snatch is over quicker than you can look); the bar turns
     * amber from `amber` and red from `red` of breaking, and says EASE OFF; PARTED shows
     * `partedShowS` s after it goes.
     */
    gauge: { peakHoldS: 6, amber: 0.5, red: 0.8, partedShowS: 20 },
    /**
     * A ship (TowLook.needs 'tug': the coaster; owner, Oct 2026) is delivered only alongside a
     * quay or pier of the port: her middle within her half beam + `berthReach` m of the face,
     * slow, for deliverTime (push her in with your bow). The harbour's lines go on and she
     * lies there `shipRemoveAfter` s before she's taken over (long enough to look at).
     */
    berthReach: 2.5,
    shipRemoveAfter: 120,
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
   *   upgrades  price and the best port reputation needed; `needs`: a module her boat must
   *             carry to fit it (the deck crane's motion compensation). `fit`: equipment a new
   *             career's workboat hasn't got until it's bought (CareerUpgrade).
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
      tow: { dory: 350, derelict: 600, logRaft: 450, barge: 800, yacht: 900, trawler: 1600, pontoon: 2000, cage: 550, coaster: 6500 } as Record<string, number>,
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
    /** The bigger fuel tank upgrade: her tank's size times this. */
    bigTankFactor: 1.6,
    /** The boat the game starts in, and a new career's (owner, Oct 2026: the fleet's beginner boat, boats/fleet.ts). */
    boat: 'starterBoat',
    /**
     * What the boatyard at Calder Haven sells (its board on the shed: ui/yardBoard.ts). With
     * `fit`: add-ons, her equipment (a new career's boat comes without it; fitted, the game
     * starts again with her refitted): on the old workboat the sockets her recipe leaves empty
     * without it; on the beginner boat (boats/fleet.ts, a Shipyard design) the change to her
     * design it makes (`design`; none: it doesn't fit her). Without `fit`: upgrades to what she
     * has.
     */
    upgrades: [
      { id: 'trawlGear', name: 'Trawl gear', price: 2500, minRep: 5, fit: ['aFrame', 'trawl', 'helm/trawl'], desc: 'The A-frame over the transom, the net on its drum and the TRAWL switch' },
      { id: 'skiff', name: 'Skiff and her crane', price: 4000, minRep: 10, fit: ['tenderCrane'], desc: 'The electric skiff in her cradle on the foredeck, and the crane to launch her' },
      { id: 'searchlight', name: 'Searchlight', price: 1500, minRep: 5, fit: ['searchlight', 'helm/spotlight', 'helm/spotJoystick'], design: { searchlight: 1 }, desc: 'The searchlight on the wheelhouse roof, its SPOT switch and joystick at the helm' },
      { id: 'fireMonitor', name: 'Fire monitor', price: 3000, minRep: 10, fit: ['fireMonitor', 'helm/firePump', 'helm/monJoystick'], design: { fireMonitor: 1 }, desc: 'The fire monitor on the roof, the FIRE PUMP switch, its joystick and gauge: the fire calls come once she has it' },
      { id: 'radar', name: 'Radar', price: 2400, minRep: 20, desc: 'Debris and floating crates on the plotter' },
      { id: 'ais', name: 'AIS receiver', price: 900, minRep: 0, desc: 'Passing ships on the plotter, by name and course, in any visibility' },
      { id: 'bigTank', name: 'Bigger fuel tank', price: 1400, minRep: 5, desc: 'Her fuel tank enlarged by 60 %: further between fills' },
      { id: 'towPost', name: 'Heavy towing post', price: 1500, minRep: 10, desc: 'The towline holds 75 % more before it parts' },
      { id: 'trawl', name: 'Bigger trawl', price: 1800, minRep: 10, needs: 'fishing.trawl', needsName: 'the trawl gear', desc: 'The net fills half as fast again' },
      { id: 'ice', name: 'Ice machine', price: 1200, minRep: 0, needs: 'fishing.trawl', needsName: 'the trawl gear', desc: 'Iced fish fetch 30 % more' },
      { id: 'craneComp', name: 'Crane motion compensation', price: 3500, minRep: 15, needs: 'deck.crane', needsName: 'a deck crane', desc: 'The deck crane holds its hook steady as she rolls, pitches and heaves' },
    ] as CareerUpgrade[],
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
    /** Rubbing on the guards damages her only in a sea over this scale (a storm), at this much per m. */
    stormSea: 2.5,
    stormRubDamage: 0.002,
    /** Damage or wear over this blinks the HULL / ENGINE lamp (on from the duty board's thresholds). */
    badAt: 0.5,
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
    // The grounds themselves (where, how rich) are level data: each region's `fishingGrounds`.
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
   * port. Faster than `maxSpeed` m/s (owner: about 9 kn, what they can keep up with) they
   * don't come, and a pod already at the bow drops back astern over `fallBack` s (and comes
   * up again if she slows while the visit lasts). Neither come out after dark (darkness
   * above `night`, 0 day .. 1 night).
   */
  wildlife: {
    gulls: { count: 6, radius: [12, 35] as [number, number], height: [7, 18] as [number, number], turnRate: [0.15, 0.32] as [number, number], wander: 12 },
    dolphins: { count: 4, every: 300, chance: 0.6, stay: 70, minSpeed: 2, maxSpeed: 4.6, fallBack: 5, minDepth: 12, minPortDistance: 500 },
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
     * Said of goods for a port with no quay, only an anchorage (owner, Oct 2026: the beginner
     * boat has no skiff; you can anchor and swim them ashore, but a boat with a skiff lands
     * them easier): on the goods' labels and the job offers there.
     */
    anchorageNote: 'no quay: land it by skiff, or anchor in the bay and swim it ashore',
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
      // The regions' goods (the Sounds): the same crates and drums, different contents.
      { name: 'Feed sack', mass: 45, size: [0.6, 0.35, 0.9] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Building materials', mass: 60, size: [0.8, 0.5, 0.6] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Whisky cask', mass: 80, size: [0.6, 0.85, 0.6] as [number, number, number], shape: 'drum' as const, slots: 2 },
      // The Fjord's: feed pellets for the farm, salmon from it (iced, in an insulated box), sawn timber.
      { name: 'Feed pellets', mass: 40, size: [0.6, 0.3, 0.85] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Salmon box', mass: 32, size: [0.9, 0.35, 0.5] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Timber', mass: 70, size: [0.5, 0.4, 1.6] as [number, number, number], shape: 'box' as const, slots: 2 },
      // The Narrows': the cannery's canned fish out; groceries in (fuel comes in the oil drums).
      { name: 'Canned fish', mass: 45, size: [0.6, 0.4, 0.45] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Groceries', mass: 30, size: [0.55, 0.4, 0.45] as [number, number, number], shape: 'box' as const, slots: 1 },
      /**
       * A lobster / crab pot (potting/potting.ts): not trade cargo (never spawned at the
       * ports' goods stacks), but carried, stowed and lashed the same way. A creel: a
       * boxy frame with netting, its line coiled on top and the marker buoy tied to it.
       */
      { name: 'Pot', mass: 24, size: [0.75, 0.42, 0.5] as [number, number, number], shape: 'pot' as const, slots: 2 },
    ],
    /** How many of `kinds` (from the start) are trade cargo, spawned at the goods stacks. */
    tradeKinds: 13,
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
   * Fog banks (where, how thick) are level data: each region's `fogBanks` (world/regions/).
   */
  /**
   * Katabatic gusts (environment/gusts.ts; the zones are each region's `gusts`, when they fall
   * its weather profile's `katabatic`).
   *   rise, fall   a gust comes up over `rise` s and dies away over `fall` s
   *   flutter      it pulses: its strength dips by up to this fraction (two slow sines)
   *   edge         across its zone it fades out over this outer fraction of the radius
   *   nearBias     how often it falls on the zone nearest the home boat (else any of the region's)
   *   maxBaseWind  no gusts while the weather's own wind is over this (m/s): lost in a gale
   *   firstAfter   the first one falls this long after you come into a region with gusts (s)
   *   debugLast    the debug menu's "Gust now" blows this long (s)
   *   lead         the dark patch on the water shows this long before the wind arrives (s)
   *   look         its patch on the water: how much darker, how much streaked with spray (0..1)
   */
  gusts: {
    rise: 4,
    fall: 10,
    flutter: 0.3,
    edge: 0.4,
    nearBias: 0.7,
    maxBaseWind: 9,
    firstAfter: 90,
    debugLast: 45,
    lead: 3,
    look: { darken: 0.3, spray: 0.4 },
  },

  /**
   * The cloud layer (environment/clouds.ts, drawn in the sky dome by skyView.ts: no extra
   * draw call; two looks into a small noise picture per sky pixel).
   *   lead        a change of weather shows on the upwind horizon this long before it comes (s)
   *   rainDark / cloudDark  how dark a weather's cloud is: rain x rainDark + cover x cloudDark
   *   scale       how many noise tiles across the cloud deck per deck height (bigger: smaller clouds)
   *   drift       the deck moves with the wind: tiles per metre the wind blows (so clouds
   *               cross the sky in a few minutes in a fresh breeze)
   *   upwind      where across the sky the upwind side takes over: from `upwind[0]` to
   *               `upwind[1]` deck heights out along the wind (0 overhead)
   *   horizon     clouds thin into the haze over this height above the horizon (sky dir y)
   *   baseDark    how dark the darkest cloud base is, as a fraction of the horizon's colour
   *   minCover    even the clearest sky has this much fair-weather cloud (of the sky, 0..1)
   *   flash       how much a lightning flash lights up the clouds
   *   noiseSize   the noise picture (pixels square, tiling)
   */
  clouds: {
    lead: 300,
    rainDark: 1,
    cloudDark: 0.25,
    scale: 0.35,
    drift: 0.0004,
    upwind: [-0.4, 3] as [number, number],
    horizon: 0.05,
    baseDark: 0.16,
    minCover: 0.15,
    flash: 1.6,
    noiseSize: 128,
  },

  /**
   * Small lights drawn as points (render/lightPoints.ts: ships' nav lights, buoys, harbour
   * lamps): `size` px at `ref` m, shrinking with distance between `min` and `max` px.
   */
  lightPoints: { size: 7, ref: 120, min: 2.2, max: 14 },

  /**
   * The moon (environment/environmentView.ts): after dusk (the sun under `from` degrees) the
   * night's light comes from the anti-sun point, as a full moon does: `light` is its
   * directional strength (the sun's is up to 3), `ambient` what it adds to the sky light,
   * `color` its cool white. Cloud dims it as it does the sun. Owner: the night sea was very dark.
   */
  moon: { from: -6, full: -12, light: 0.35, ambient: 0.1, color: 0xc4d2ff },

  /**
   * Breaking waves on beaches (ocean/oceanView.ts, the shore in ocean.frag.glsl): a map of
   * the water's depth `span` m square round the viewer, `cells` across, baked `rowsPerFrame`
   * rows a frame and again when the viewer is `rebake` m from its middle. A wave breaks where
   * its height reaches about 0.78 of the depth (a surf beach's rule), so a calm sea breaks
   * only in the last few centimetres and a storm out to a couple of metres: foam there, out
   * to `maxDepth` m at most, and a line of wash in the last `wash` m of depth.
   */
  shore: { span: 3600, cells: 192, rowsPerFrame: 16, rebake: 700, maxDepth: 4, wash: 0.8 },

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
    // Fog banks (where, how thick) are level data: each region's `fogBanks`.
    /**
     * Fog: scene fog runs from `nearFraction` x the fog's far end to that end. In fog
     * (visibility under ~3 km) the near end is close in, `nearFraction`; in clear air it
     * stands further out, `hazeNearFraction` of the haze distance, so the sea is crisp for
     * the first few kilometres and the far land only softens. Blended between the two in
     * log(visibility) between 3 and 13.5 km.
     */
    nearFraction: 0.12,
    hazeNearFraction: 0.35,
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
     * back (s), and the pivot's height above the window head (m). Each wiper is sized to its
     * own pane (owner: they didn't grow with the windows; rainGlass.ts wiperFit): its arm and
     * blade as long as the pane's height allows, its sweep at most `wiperSweepDeg` either side
     * and no wider than keeps the blade `wiperEdge` (m) inside the pane's sides; the blade
     * clears the sill and the head by `wiperMargin` (m).
     */
    wiperPeriod: 1.7,
    wiperSweepDeg: 45,
    wiperPivotAbove: 0.1,
    wiperMargin: 0.02,
    wiperEdge: 0.06,
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
    /**
     * Diesel exhaust smoke (vessel/exhaust.ts: the model; vessel/view/exhaustSmoke.ts: the
     * drawing). Owner, Oct 2026: a small simulation of why a diesel smokes, not a lookup.
     *
     * A diesel always takes a full charge of air and injects fuel into it; it smokes BLACK
     * (soot) when the air–fuel ratio goes rich of the smoke limit, as it can't burn all the
     * fuel: lugging (full rack, revs well down: a turbo gives little boost at low revs, and a
     * mechanical pump delivers more per stroke slowly), a throttle snap (the rack opens before
     * the turbo spools up: turbo lag), or an overloaded engine. It smokes WHITE when cold
     * (fuel and water vapour unburnt: a cold block, poor atomisation), BLUE when it burns its
     * lube oil (worn rings and guides: a worn engine, most at idle and when cold). Warm, clean
     * and within its power it shows a faint grey haze only.
     *
     *   lambdaFull    the air–fuel ratio, relative to stoichiometric, at full rack and rated
     *                 revs, warm: the maker's smoke limit (naturally aspirated / turbocharged);
     *                 `slowEngine`, a slow-revving heavy one's
     *   smokeLambda   soot starts to show below this ratio; blackLambda: solid black
     *   turbo         boost at full exhaust energy (1 = twice the air) and how long it takes
     *                 to spool up (s; it falls off twice as fast). Turbocharged engines are
     *                 the ones whose voice has a turbo (CONFIG.engineVoices).
     *   lugFuel       a mechanical pump's over-delivery: fuel per stroke at full rack rises
     *                 by this from rated revs down to a standstill
     *   snapFuel      the transient over-fuelling as the rack swings open (per unit of rack
     *                 per second)
     *   coldC         white smoke from the block stone cold up to this temperature (°C),
     *                 gone by coldClearC
     *   blueWear      how much blue a worn-out engine (wear 1) makes at idle
     *   haze          the opacity of the clean warm engine's haze
     *   jet, jetPerRpm, lift, rise   how fast it leaves the outlet (m/s: jet + jetPerRpm ×
     *                 rpm fraction), its upward kick (m/s, plus as much again at random),
     *                 and the plume's drift upward as it drags to still air (m/s)
     *   greyHaze, greyBlack   the grey of the haze and of solid soot, fresh from the outlet
     *                 (linear light: 0.16 shows as a mid grey, 0.02 as near black)
     *   greyAge       how much it lightens as it disperses (over its life)
     *   rate, ratePerOpacity   particles per second from a warm engine at rated revs: rate +
     *                 ratePerOpacity × the smoke's opacity (fewer at low revs)
     */
    exhaust: {
      lambdaFull: { natural: 1.45, turbo: 1.7 },
      /**
       * A slow-revving heavy-duty engine's full-load ratio (owner, Oct 2026: the tug's smoke
       * "wasn't black"): one rated at or under `ratedRpm` (the tug diesel) is set up rich for
       * torque, `lambdaFull`, so worked hard it smokes: black opened up from idle, dark
       * grey-black towing a heavy tow flat out; clean once she's running free.
       */
      slowEngine: { ratedRpm: 1200, lambdaFull: 1.15 },
      smokeLambda: 1.35,
      blackLambda: 0.95,
      turbo: { maxBoost: 1.0, lagS: 1.5 },
      lugFuel: 0.3,
      snapFuel: 0.4,
      coldC: 25,
      coldClearC: 60,
      blueWear: 0.6,
      haze: 0.12,
      jet: 1.4,
      jetPerRpm: 2.2,
      lift: 0.3,
      rise: 0.4,
      greyHaze: 0.16,
      greyBlack: 0.02,
      greyAge: 0.08,
      rate: 10,
      ratePerOpacity: 60,
      /**
       * A tug's cooling water out of its hole in her side (owner, Oct 2026: "the cooling
       * water spits out the side close to the water line... intermittently, as the pump spits
       * out some water"; ExhaustFitting `water`): while the engine runs, a spurt every
       * `everyS` seconds (a random time between the two; more often with more revs: `perRpm`
       * shortens it by up to that share at rated revs), each `drops` drops over `spurtS`
       * seconds, leaving at `speed` m/s (± `spread`), falling as water does.
       */
      water: { everyS: [0.9, 2.4] as [number, number], perRpm: 0.5, drops: 30, spurtS: 0.5, speed: 3.0, spread: 0.6, size: 0.32 },
    },
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
      /**
       * The propeller's jet (owner: a tug at full throttle, hardly moving, should churn the
       * water astern). Momentum theory: the slipstream far behind the disc moves aft through
       * the water at u = sqrt(V^2 + 2 T / (rho A)) - V (V the speed of advance, T one
       * propeller's thrust, A its disc area). Its foam is carried aft at u, slowing as the
       * jet mixes into the water around it (time constant `jetTau` s, so it travels at most
       * u x jetTau), and spreads sideways at up to `washSpread` m/s at full wash.
       */
      jetTau: 2.2,
      washSpread: 0.9,
      /** A planing hull's wake (owner: more pronounced): spread up to `planingSpread` x maxSpread, the white water astern full. */
      planingSpread: 1.6,
    },
    spray: {
      maxParticles: 900,
      /**
       * Planing (owner: planing boats throw up a lot of spray), from her hull's `planing`
       * Froude range (fnStart .. fnFull): sheets of spray thrown out from both chines where
       * her bottom meets the water (found each frame: where her keel line goes under the
       * surface, as she trims and pitches; owner, Oct 2026), `sheetRate` particles/s per m/s
       * at full planing; and a mist kicked up behind her transom (`sternRate` per m/s), left
       * behind as she runs on. The bow wave comes off the same point while it's forward of
       * amidships.
       */
      planing: { sheetRate: 18, sternRate: 3 },
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
  /**
   * The roving fender (vessel/walkFender.ts, player/fenderHands.ts; owner): with the
   * fenders out, stand at the rail, look at the quay or the boat alongside, press with an
   * empty hand, and a fender is hung there at your station. It counts only if what you're
   * looking at is within `reach` m of her side (the far side of a wide gap is no use), and
   * only along the ray's first `rayLength` m. It can't hang within `endClear` m of her stem
   * or transom. Hung by the first press; another press elsewhere moves it.
   */
  fenderWalk: {
    reach: 3.0,
    rayLength: 6,
    endClear: 0.4,
  },

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
    /**
     * Boat against boat (vessel/physics/vesselContact.ts): friction across the touch, as a
     * fraction of the push, so a tug's bow holds on a ship's side instead of skating along
     * it (owner, Oct 2026: pushing a ship onto her berth). Plain plating on plating; a push
     * fender's own `pushFender.friction`, the crew's fenders' `fenderFriction`.
     */
    boatFriction: 0.35,
    /**
     * What a boat hangs or fits on her own sides to keep her topsides off a quay (owner: a
     * Shipyard choice; vessel/physics/guards.ts). Each is probed at its own points, standing
     * proud of the hull, so it touches before the plating does. Per point, as the hard
     * values above: `stiffness` (N/m), `damping` (N per m/s), `friction` (sliding, as a
     * fraction of the push). `absorb` (m/s): how much of the approach speed it takes up
     * before any of the hit reaches the hull for damage (vessel/wear.ts `impactSafe` then
     * applies on top). A softer guard lets her lean in further, and soaks up more of the knock.
     *   fenders  the crew's air-filled fenders, hung on their lines (only while out):
     *            softest, slippery;
     *   strake   a solid rubber rubbing strake along her sheer: firm, takes a rub or a
     *            moderate knock; it's thin, so a hard push reaches the plating;
     *   tyres    old lorry tyres in a close row (a tug's or a pushboat's): soft and grippy,
     *            they hold her against a quay or a hull she's pushing.
     */
    guards: {
      fenders: { stiffness: 6e4, damping: 2e4, friction: 0.15, absorb: 1.2 },
      strake: { stiffness: 2.5e5, damping: 3e4, friction: 0.5, absorb: 0.4 },
      tyres: { stiffness: 1e5, damping: 3e4, friction: 0.7, absorb: 0.9 },
      /**
       * A tug's push fender (modules/pushFender): a thick block of rubber on her square bow,
       * built to push barges and ships: stiffer than tyres (it carries her whole thrust),
       * grippy so the bow doesn't slide off what she's pushing, and it takes a hard knock.
       */
      pushFender: { stiffness: 2e5, damping: 4e4, friction: 0.8, absorb: 1.2 },
    },
  },

  /** Desktop debug driving with the arrow keys (in VR you use the bridge controls). */
  /**
   * The Shipyard (shipyard/): matching a design's gearbox by trial. `matchRpm`: flat out
   * should settle at this share of the engine's rated rpm (the landing craft's: 1696 of
   * 1800); `runSeconds`: how long each full-throttle trial runs before it's read.
   */
  /**
   * A planing hull in a turn (vesselPhysics.ts; each hull's `planing`): her side force's
   * heeling moment reckoned with it acting `alpha` of the way from her chines up to her CG
   * (her bottom's lift carries it, not her keel); her lift's roll stiffness, `stiffness` x
   * W x her half-beam at the chines, toward a lean into the turn of her `lean` x the
   * apparent vertical's angle (gravity with U r), at most `maxLeanDeg`. Tuned on sea trials,
   * flat out then the helm put over (owner: the landing craft should lean in, the small ones
   * most): on a 40 % helm the Shipyard's landing craft type leans ~9 deg in at 7.2 m, ~6 at
   * 9 m (the built-in landing craft ~7); the deep-V pilot boat ~15; the semi-displacement
   * workboat ~5. Hard over the 9 m landing craft leans ~13 deg in, then comes upright as she
   * slows; the workboat heels ~5 deg out; none capsizes, even with four outboards.
   */
  planingTurn: { maxLeanDeg: 20, alpha: 0.6, stiffness: 1.5 },

  shipyard: {
    /**
     * How a Shipyard hull rides at speed (owner, Oct 2026: the workboat a semi-displacement hull,
     * the pilot boat a deep-V planing hull built to go fast in waves, the landing craft flatter
     * and faster but a poorer sea boat). Each hull type has a `regime` (build.ts DESIGN_HULLS):
     *   planing       her weight carried on her bottom's lift from Fn `fnStart` (off the hump)
     *                 to `fnFull` (planing): `lift` 1;
     *   semi          a semi-displacement hull: only part of her weight (`lift`) carried by
     *                 lift, coming in later and more gradually (Fn 0.4 to 1.0);
     *   displacement  none (the tug).
     * Leaning into a turn (vesselPhysics.ts, CONFIG.planingTurn): a planing bottom's lift
     * leans her in toward `lean` x the angle a cyclist would lean; every planing hull
     * `leanBase`, a deeper vee more, from her deadrise aft (`deadriseAt` of her length from the
     * transom, where her planing pressure acts): lean = (`leanBase` + `leanPerSine` x
     * sin(deadrise)) x lift. The landing craft type's 8 deg: 0.84; the 22 deg deep-V pilot
     * boat: 1.07; the semi-displacement workboat's 18 deg at half lift: 0.5.
     * Slamming (the vertical damping's quadratic term, vesselPhysics.ts, standing in for
     * water-entry loads): a flat bottom slams, a deep vee enters gently. Scaled as
     * tan(`slamRefDeg`) / tan(deadrise), the landing craft's 9 deg amidships the reference,
     * between `slamMin` and `slamMax`; her deadrise amidships, where she meets the waves.
     */
    regimes: { planing: { lift: 1, fnStart: 0.3, fnFull: 0.7 }, semi: { lift: 0.5, fnStart: 0.3, fnFull: 0.9 } },
    leanBase: 0.7,
    leanPerSine: 1.0,
    deadriseAt: 0.25,
    slamRefDeg: 9,
    slamMin: 0.35,
    slamMax: 1.6,
    /**
     * Her roll damping going ahead (vesselPhysics.ts `rollLift`: the lift part of roll damping,
     * growing with speed), for every Shipyard hull: about doubles it at a fast boat's full speed.
     */
    rollLift: 0.3,
    matchRpm: 0.93,
    runSeconds: 45,
    /**
     * Sketching on her views (shipyard/planeSketch.ts; owner, Oct 2026: sketch together in
     * real time): a stroke being drawn is sent to the others this often (ms), so they see the
     * pen moving, not just the finished line.
     */
    sketchShareMs: 120,
    /**
     * Her propeller shaft's angle to the horizontal (deg), rising forward from the propeller
     * (shipyard/machinery.ts; owner, Oct 2026: a reasonable shaft angle decides where the
     * engine goes). Small craft run about 8-12°: steeper wastes thrust and stands the engine
     * up through her floor. Where it puts the engine is where she carries its weight, where
     * the game draws it, and where its hatch goes (engineHatch, below).
     */
    shaftAngleDeg: 10,
    /**
     * ...steeper (deg), a degree at a time, where that lets the engine sit nearer where her
     * weights balance (owner, Oct 2026: not always far forward), or clear a bottom too flat aft.
     */
    shaftAngleMaxDeg: 15,
    /**
     * The engine hatch and the engine space under it (build.ts; owner, Oct 2026: the engine
     * goes where her shaft line puts it, not in a box under the wheelhouse). Metres:
     *   endRoom, sideRoom    the hatch past the engine's ends and its sides (room for the
     *                        dipstick and the oil can's shelf beside it);
     *   minLength, maxLength the hatch's length, whatever the engine's (a tug diesel's
     *                        2.65 m would be a big lid to lift);
     *   minWidth             narrower than this (a tight spot by the deck edge) and it goes elsewhere;
     *   helmRoom             in the cabin floor, aft of the console by this: an engine under the helm gets
     *                        its hatch right behind the console, as a wheelhouse's often is (open, it's a
     *                        hole where you'd stand to steer: shut it to get under way);
     *   deckMargin           on deck, in from the deck edge by this (the bulwark, the deck edge margin);
     *   soleClear            the engine space's floor plates this far over her bottom's highest point under
     *                        the engine's sides (twin: both engines'; the space spans both).
     */
    /**
     * What her hull and houses are built of (owner, Oct 2026: the gillnetter and the tug steel,
     * the landing craft and pilot boat aluminium, the workboat either; build.ts weighs her by
     * it). Per square metre of her plating with its framing, bulkheads and welds averaged in
     * (`shellKgPerM2`: about 6 mm of plate and as much again in framing, bulkheads and engine
     * beds for a 10-14 m boat, aluminium at 2.7 t/m3 and steel at 7.85; a hull type can ask for
     * heavier, build.ts DESIGN_HULLS `scantlings`), and of her houses (`houseKgPerM2`: thinner
     * plate); and `pricePerKg`, built: aluminium dearer to buy and to weld.
     */
    materials: {
      aluminium: { shellKgPerM2: 35, houseKgPerM2: 18, pricePerKg: 20 },
      steel: { shellKgPerM2: 85, houseKgPerM2: 50, pricePerKg: 5 },
    },
    /**
     * Her other weights (build.ts), and her load as trialled:
     *   bulwarkShare     bulwarks weigh this share of her plating a square metre (thinner, less framing);
     *   machineryShare   shafting, propeller, rudder, tanks, exhaust and cooling: this share of the engines' weight;
     *   outfitKgPerM2    wiring, interior, windows, fittings and paint, per m2 of her deck (80 % of length x beam);
     *   outfitPricePerKg ...and what it costs a kilo, fitted;
     *   fuelShare        her tanks this full (half: the usual trial condition), fuel at `fuelDensity` kg/l;
     *   crewKg, storesKg two crew, and stores;
     *   gear             deck gear without a weight of its own in the game (kg each);
     *   payloadFreeboard her deck payload: what sinks her by this share of her freeboard amidships
     *                    (so a light hull carries more than the same hull built heavy).
     */
    weights: {
      payloadFreeboard: 0.12,
      bulwarkShare: 0.6,
      machineryShare: 0.35,
      outfitKgPerM2: 32,
      outfitPricePerKg: 12,
      fuelShare: 0.5,
      fuelDensity: 0.84,
      crewKg: 170,
      storesKg: 150,
      gear: { towWinch: 450, aFrame: 350, sternRoller: 60, skiff: 500, anchor: 150, rodRack: 12 },
    },
    engineHatch: { endRoom: 0.1, sideRoom: 0.2, minLength: 0.8, maxLength: 1.8, minWidth: 0.6, helmRoom: 0.1, deckMargin: 0.35, soleClear: 0.08 },
    /**
     * The skiff's cradle at least this far off the centreline toward her crane's side (m;
     * build.ts; owner: the skiff and crane go over to one side, like the deck crane, not in
     * the middle). It goes as far over as fits; nearer the middle only if there's no room.
     */
    skiffOffset: 0.3,
    /**
     * Live sea trials at the Trials step (shipyard/liveTrial.ts; owner, Oct 2026: see how the
     * hull behaves). Calm deep water; she settles for `settleS` first.
     *   drop      lifted `dropM` above her rest, heeled `dropHeelDeg` and trimmed
     *             `dropTrimDeg` (bow down), as the game's Drop test, and let go;
     *   roll      heeled `rollDeg` and let go (owner: from 45°, a hard test: her deck edge
     *             well under, the righting arm beyond its small-angle range);
     *   incline   a weight of `inclineShare` of her displacement moved `inclineBeamShare`
     *             of her beam across, starting `inclineStartS` in, over `inclineMoveS` s;
     *             GM from the steady heel (owner: a bigger weight than a real test's, so the
     *             heel shows: 6 % moved 0.45 B heels a 1 m GM boat ~4°, still small enough for
     *             the small-angle formula).
     * `seconds`: how long each runs.
     */
    live: { settleS: 10, dropM: 4, dropHeelDeg: 6, dropTrimDeg: -3, rollDeg: 45, inclineShare: 0.06, inclineBeamShare: 0.45, inclineStartS: 1, inclineMoveS: 3, seconds: { drop: 20, roll: 30, incline: 14 } },
    /**
     * The working deck gear a design can carry (shipyard/build.ts; owner, version 10), where
     * it goes and what it adds to her price (GBP):
     *   winchFromTransom  the tow winch's drum this far forward of the transom, on the
     *                     centreline (the starting workboat's: 0.75 m);
     *   standRoom         clear deck forward of the winch to stand at it (m);
     *   sideDoor          the sliding door in the wheelhouse's port wall: its width, how far
     *                     aft of the console it starts, its buttons' height above the floor,
     *                     and the side deck it needs outside to step onto (m: room to stand
     *                     clear of the deck edge, layout deckEdgeMargin + bodyRadius);
     *   ringFromCorner    the life ring this far in from the house's aft corner (m).
     *   anchor            the anchor and windlass (owner): its roller `fromStem` aft of the
     *                     stem on the bulwark's top (at the stern, on a ramp-bow boat: on the
     *                     port quarter, `fromSide` in from her side, its windlass `kedgeAft`
     *                     forward of the roller, close by the transom on a short aft deck).
     *                     (Its weight, and the skiff's and her crane's, are in her lightship
     *                     as a whole: those modules don't weigh themselves, so she floats on
     *                     her designed lines with them.)
     */
    /** A three-facet wheelhouse front (owner): its outer panes angled back this far from square across her (deg). */
    facetDeg: 30,
    /** Windows raked out all round (owner: a tug's or supply vessel's bridge): the side and aft windows lean out this far from vertical (deg), from their sill up to the roof. */
    flareDeg: 15,
    /** The roof's visor: how far it reaches forward of the top of the front windows (m), overlapping them. One set length now (owner: no slider for it; it was 0.15 to 0.75). */
    visor: 0.3,
    /**
     * The window sills, one height all round (owner), above the wheelhouse floor (m):
     * `standard` (the dash top stands above it at the front), or `low`, below the console's
     * desk (0.9 m), with the console's upright panel taken off and its screens on stalks so
     * you see down past them (owner).
     */
    windowSills: { standard: 1.0, low: 0.75 },
    /**
     * How far (m) the console stands clear of the front glass (owner: with the sill below the
     * dash top, the dash rose into the window band against the glass): the console, and what's
     * placed by it, go aft until each part rising above the sill (the dash, or the low-sill
     * desk and screens; the screens hung from the roof) is at least this far behind the glass
     * at its height, whichever way the glass rakes (shipyard/build.ts consoleBack).
     */
    consoleClear: 0.2,
    /**
     * The helm in the skipper's view, however wide the wheelhouse (owner, Oct 2026: on a wide
     * one "the instruments are very widely spaced apart ... you can't see them all when
     * you're steering"; "cut the console short ... better visibility around the side of it",
     * and to port, the middle or starboard: design.consoleSide). The console is no longer than
     * `maxConsole` (m; the reference console, the landing craft's, is 1.98 m), so on a wide
     * wheelhouse there's floor and glass beside it; against the port or starboard wall if
     * chosen. Its screens stand in one row centred over the wheel, `screenGap` (m) between
     * them. The units hung from the roof out to the sides (the VHF, the chartplotter, the FM
     * set) come no further than `hungReach` (m) from the wheel.
     * With pod drives (`podJoystick`, the console's axes, m, z aft): the throttle forward on its
     * pedestal (`throttleZ`), the helm joystick aft of it (`stickZ`), its JOYSTICK button
     * `button` [x, z] from the stick (between the two, outboard).
     */
    /**
     * A tug's dry exhaust stacks (owner, Oct 2026: "a nice beefy pipe... it comes out the roof...
     * in a corner of the wheelhouse... high enough to keep the smoke out of the way"; then, from
     * a modern tug's photo, not an old steamship's: plain pipes "with a little bit of angle",
     * one or two "depending on the engines"; module fitting.exhaust-stack). Small tug hulls
     * only. One pipe per engine, `radius` m round, each in an aft corner of the wheelhouse
     * (starboard; a twin's second to port), `inset` m clear of the walls, from `below` m under
     * the cabin floor (down to the engine space) up through the roof in a painted `casing`, its
     * top `aboveRoof` m over the roof. Raked (design.stackStyle 0): upright, then its top
     * `rakedShare` of that height bent aft `rakeDeg` at a joint (owner: "part of it to be
     * vertical and then... the last 30% to be raked"), tapering to `taper` of its radius, its
     * top cut on a slant `cutDeg` facing aft; straight
     * (1): upright, its top cut square. A weathered bronze-brown (`colour`). The smoke from
     * their tops. Her cooling water leaves by a hole `waterAbove` m over the waterline in her
     * side for each, abreast of her engines (CONFIG.effects.exhaust.water).
     */
    exhaustStack: { radius: 0.14, inset: 0.05, below: 0.5, aboveRoof: 1.9, waterAbove: 0.3, rakedShare: 0.3, rakeDeg: 25, cutDeg: 35, taper: 0.88, colour: 0x7a5236, casing: 0xd8d6d0 },
    helm: { maxConsole: 2.2, screenGap: 0.02, hungReach: 1.0, podJoystick: { throttleZ: 0.0, stickZ: 0.225, button: [0.085, -0.08] as [number, number] } },
    /**
     * The advanced interior's working lights (owner): the overhead switch panel (panel.overhead)
     * and the foredeck and aft deck floodlights (light.flood). No rail lights for now (owner).
     *   overheadAft   the panel's face this far aft of the wheelhouse front (m), on the
     *                 centreline, just aft of the hung NAV / WIND screen and over the helm;
     *   flood.x       each flood this far to port of the centreline (m), clear of the
     *                 searchlight and the fire monitor at their usual centreline places;
     *   flood.inset   in from the roof's front or aft edge (m);
     *   flood.keepClear  the roof round each flood that hand-placed roof gear keeps off (m).
     */
    workLights: { overheadAft: 0.7, flood: { x: 0.35, inset: 0.1, keepClear: 0.3 } },
    deckGear: {
      winchFromTransom: 0.75,
      standRoom: 0.6,
      sideDoor: { width: 0.75, fromConsole: 0.35, buttonHeight: 1.1, sideDeck: 0.5 },
      ringFromCorner: 0.4,
      anchor: { fromStem: 0.35, fromSide: 0.45, kedgeAft: 0.4 },
      /**
       * With a skiff (owner): a pair of midship cleats for her painter, one on each bulwark top,
       * this far (m) off the house's end on the skiff's deck (the workboat's are just aft of
       * her wheelhouse), and at least `fromEnds` (m) inside the mooring cleats.
       */
      midCleats: { fromHouse: 0.4, fromEnds: 0.6 },
      price: { towWinch: 12_000, sternRoller: 2_000, aFrame: 18_000, lifeRing: 600, sideDoor: 3_000, anchor: 3_500, skiff: 38_000, rodRack: 700 },
    },
    /**
     * The deckhouse a design can have under her wheelhouse (shipyard/build.ts): its walls and
     * top weigh `kgPerM2` (welded aluminium plate and stiffening) and cost `pricePerM2`
     * (GBP); it stops `fromStem` m short of her stem (the narrow bow) and `edge` m inside her
     * deck edge (the bulwark), when it's full width.
     */
    deckhouse: {
      kgPerM2: 35,
      pricePerM2: 450,
      fromStem: 1.2,
      edge: 0.12,
      /**
       * Its top walked (parametric boats P2b, design.dhWalk; owner): kept `margin` (m) in from
       * its edge, where a rail `railHeight` high stands (`railKgPerM` kg a metre, two rails on
       * posts no more than `postSpacing` apart, owner); a ladder `ladder.width` wide up from the main deck, its climbing zone
       * `ladder.depth` out from the face (`ladder.kg`). Walked only where there's at least
       * `minFore` of top forward of the wheelhouse, or a strip beside it wide enough for the
       * ladder.
       */
      walk: { margin: 0.25, railHeight: 0.9, postSpacing: 1.2, railKgPerM: 4, minFore: 0.6, ladder: { width: 0.45, depth: 0.45, kg: 20 } },
    },
    /**
     * A saloon aft of the wheelhouse (parametric boats P2b, design.saloon): the house runs on
     * aft, one house under one roof. Shorter than `minLength` (m) where her deck runs out, it's
     * left off. Stepping down into it, each step is a 0.2 m rise (design.saloonFloor) with a
     * tread `tread` m deep between (a comfortable stair's going), aft of the wheelhouse.
     * Its own roof (design.saloonRoof) can be lower, in 0.2 m steps, a step in the roofline at
     * the wheelhouse's aft end, its windows coming down with it; but never so low that its
     * headroom over its floor is less than the doorway's plus 0.1 m, or its window band (sill
     * to frame) is under `minBand` m tall. `roofInset`: how far in from the roof top's edges
     * a roof-top panel in a second colour (design.roofTop, the eyebrow) is set (m).
     */
    saloon: { minLength: 1.2, tread: 0.28, minBand: 0.35, roofInset: 0.1 },
    /**
     * A cockpit overhead (parametric boats P2b, design.overhead; owner): the house's aft roof
     * carried on aft over the working deck, as the Alaskan 38's, on a wing each side. Fitted
     * (m): `inset` in from the deck edge (just inside the bulwark), each wing a plate `wing`
     * thick; the wing's knee on the deck `kneeShare` of the way aft (no more than `kneeMax` m
     * from the house), its curve sweeping up from there to the roof's aft edge. It stops
     * `transomClear` short of the transom and `gearClear` short of what stands up through it
     * (a pole's searchlight or monitor, the A-frame), and isn't fitted over a deck crane's or
     * the skiff crane's aft deck (their booms would strike it). Shorter than `minLength`, it's
     * left off; under `minHeadroom` over the deck, the Shipyard says so.
     */
    overhead: { inset: 0.08, wing: 0.06, kneeShare: 0.45, kneeMax: 1.2, transomClear: 0.2, gearClear: 0.3, minLength: 0.6, minHeadroom: 1.95 },
    /**
     * Hull protection (owner): what keeps her sides off a quay (design.ts `guard`). Prices
     * (GBP): a set of fenders and their basket the cheapest; the rubbing strake and the
     * tyres by the metre of her and per tyre (the build counts them). `fenders`: how many
     * a side (spread along her, as the workboat's three).
     */
    /** The small tug's push fender (GBP), with its fixings. */
    pushFenderPrice: 4500,
    protection: { fendersPrice: 450, strakePerM: 110, tyrePrice: 90, tyreFitting: 600, fenders: 3 },
  },

  /**
   * Touchscreen controls (ui/touchControls.ts), shown on a phone or tablet (a coarse pointer
   * and no mouse), or with ?touch=1 in the address (?touch=0 hides them). No multiplayer
   * from a phone yet (owner). `leverDetent`: within this of the middle, the throttle slider
   * snaps to neutral. `lookSensitivity`: radians of view per pixel dragged.
   * `startAboard`: board at the helm as the game starts.
   */
  touch: {
    leverDetent: 0.08,
    lookSensitivity: 0.005,
    startAboard: true,
  },

  debugDriving: {
    /**
     * Lever travel per second while the key (or a controller's bumper) is held (full range is
     * -1..1): neutral to full ahead in about 1.1 s (the owner's desktop crew found 0.6 slow).
     */
    leverRate: 0.9,
    /** Helm travel per second while the key is held (full range is -1..1). */
    helmRate: 0.8,
  },

  /**
   * A game controller on the desktop (player/gamepad.ts): the sticks' dead zone (0..1 of
   * their travel), the steering curve (helm = stick^steerCurve: gentle near the middle), how
   * close to the helm (m, on deck) "F: take the helm" shows, and how fast the right stick
   * looks round (rad/s at full deflection).
   */
  gamepad: { deadZone: 0.15, steerCurve: 1.5, helmReach: 1.6, lookRate: 2.4 },

  /**
   * The boatyard (owner, Oct 2026): where she's fitted out and mended, on the Calder Haven
   * quay (the shed on the apron, a yard crane at the quay edge and old boats laid up round
   * the shed: world/regions/home.ts; the slipway was too far from the berths). Its
   * board on the shed's front (ui/yardBoard.ts) sells the add-ons and upgrades and does the
   * repairs, with her in this port. `board`: its centre (x, z; m), its height above the
   * ground, the way it faces (deg, compass: 270 = west), its width (m), how near (m) you
   * must be for it to be drawn, and how far a pointer reaches it (m: VR and desktop).
   */
  /**
   * The boatyards (ui/yardBoard.ts): one per port that has one, its board on the shed's front
   * (world x, z, height above the ground, the compass bearing it faces, its width, how near
   * you must be to see it and to reach it). What each sells and charges is the port's
   * `economy` (world/defs.ts PortDef): Calder's the equipment and the everyday upgrades at the
   * standard rate; Loch Tarsk's the radar and the heavy towing post, and repairs cheaper.
   */
  boatyards: [
    { port: 'calder', name: 'Calder Boatyard', board: { x: 727.4, z: 645, up: 2.15, facingDeg: 270, width: 1.7, range: 25, reach: 4 } },
    { port: 'tarsk', name: 'Loch Tarsk Yard', board: { x: 597, z: -3921.5, up: 2.15, facingDeg: 0, width: 1.7, range: 25, reach: 4 } },
  ],

  /** Anchoring: the anchor's holding power by the bottom (PortDef.bottom; sand elsewhere). */
  anchoring: {
    bottomHolding: { sand: 1, mud: 0.8, weed: 0.55, rock: 0.4 } as Record<'sand' | 'mud' | 'weed' | 'rock', number>,
  },

  /** Player movement aboard and ashore. */
  locomotion: {
    /**
     * Grab-the-world (grip + drag) is always on; smooth stick movement is optional.
     * This and snapTurnDeg are defaults: the VR menu changes them per device.
     */
    smoothEnabled: true,
    smoothSpeed: 1.4,
    /**
     * Running (owner request): walking speed times this. VR: push the stick all the way;
     * desktop: Shift (a controller: the left stick clicked in). 2.4 was too slow (owner).
     */
    runMultiplier: 3.2,
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
  /**
   * SOS (owner, Oct 2026; rescue/sos.ts): a boat capsized or sunk is recovered to the nearest
   * boatyard's port by the salvage tug, from the main menu (Boat > SOS) or the red button
   * under the VHF set. Upright and afloat, the coastguard turns an SOS down.
   *   overturnDeg  she counts as capsized once she's rolled or pitched this far from upright
   *   sunkDepth    ...or her waterline is this far under the surface (m): sunk
   */
  sos: { overturnDeg: 80, sunkDepth: 3 },

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
    /**
     * A crew-mate overboard takes the ring when it floats within this of them (m: a couple
     * of strokes; their own game checks it, the host allows a little slack for lag).
     */
    crewCatchRadius: 2.5,
    crewCatchSlack: 1.5,
    /**
     * A swimmer into a turning propeller (owner: a bloody special effect, for fun). Turning:
     * in gear with the engine over `minRpm`. Struck: their chest within the blades' radius
     * + `reach` (m) of the hub. Then, from the hit (s): the view red at once, fading to black
     * by `blackAt`, put back aboard her at `respawnAt`, clear again by `clearAt`. Everyone
     * sees a burst of `droplets` red drops, then red froth churned up at `frothRate` a
     * second for `frothSec`.
     */
    propStrike: { minRpm: 300, reach: 0.55, blackAt: 1.1, respawnAt: 1.8, clearAt: 3.2, droplets: 140, frothRate: 45, frothSec: 2.2 },
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
    /**
     * A survivor in the water swims for the ring once it floats within `swimToRing` m of
     * them (owner: a hard throw to land right on them in VR), at `swimSpeed` m/s, while no
     * one else is on the line.
     */
    swimToRing: 14,
    swimSpeed: 0.7,
    /**
     * People on a liferaft or a sinking boat (rescueDefs `prop`) climb aboard straight from
     * it: your stern within `raftRange` m of it and in neutral, one after another. A
     * sinking boat goes down `sinkTime` s after the call (its people into the water then,
     * for the ring); the raft and the upturned dinghy drift as everything does.
     */
    raftRange: 4.5,
    sinkTime: 300,
    /** Boat hook: length (m), how close its tip must come to a crate to hook it, and how close
     *  alongside (from the hull side, m) a hooked crate must be to lift aboard. */
    hookLength: 2.2,
    hookReach: 0.6,
    /**
     * Pushing off with the boat hook (owner, Oct 2026): its tip on a quay, a pier or the
     * shore, each press of the trigger (VR) or click (desktop) gives the boat a shove of
     * `impulse` N·s along the hook, away from what it's on (a person's hard push for a
     * second or two), at the hand. She moves by impulse / her mass: a 4 t boat a fifth of a
     * knot a push, a 60 t tug hardly at all, so a heavy boat takes many pushes. No feedback
     * through the hand, so it's a nudge, not physics. `every`: no more often than this (s).
     */
    hookPush: { impulse: 900, every: 0.3 },
    /**
     * Auto-extend (menu option, on by default): pointed at a floating crate or a tow's bow
     * eye within this range (m), the hook telescopes out to it; it slides back to its own
     * length once something is on it, bringing it in. Telescoping speed (m/s) out and in.
     */
    hookAutoReach: 8,
    hookExtendSpeed: 10,
    hookRetractSpeed: 1.5,
    liftRange: 2.5,
    /** The menu's quick "Lift crates" (no hook): crates floating within this of the hull (m). */
    quickLiftRange: 15,
    /**
     * VR: lifting a hooked crate aboard (alongside). The crate floats at the waterline at the
     * end of the pole, beyond a hand's reach, so your free hand either takes hold of the
     * pole, or reaches over the side within this of the crate horizontally (m, about the
     * pole's length; owner VR test: it was 1 m, which no arm reaches).
     */
    liftHandReach: 2.2,
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
    /** Night strobe on survivors' lifejackets (crates have none): flash period and length (s); shown when it's this dark (0..1). */
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
    // or AAC. Each must allow cross-origin use to be placed at the set (all these do); one
    // that doesn't plays without direction. A dead one just shows NO SIGNAL.
    stations: [
      { freq: '88.6', name: 'TruckersFM', url: 'https://live.truckers.fm/' },
      { freq: '91.2', name: 'Heart 90s', url: 'https://media-ssl.musicradio.com/Heart90s' },
      { freq: '94.7', name: 'Absolute 90s (1.FM)', url: 'https://strm112.1.fm/90s_mobile_mp3' },
      { freq: '97.3', name: 'Heart', url: 'https://media-ssl.musicradio.com/HeartUK' },
      { freq: '101.5', name: 'Smooth', url: 'https://media-ssl.musicradio.com/SmoothUK' },
      { freq: '104.8', name: 'Radio Paradise', url: 'https://stream.radioparadise.com/mp3-128' },
    ],
    /** Full level within `fullRange` of the set (m), fading to silence at `range`. */
    fullRange: 3,
    range: 16,
    /** Streams are mastered loud: their level at 100 % on the FM volume setting (owner: too loud). */
    gain: 0.2,
    /**
     * Heard from outside the wheelhouse (owner: quieter out on deck), through its walls:
     * the level times `outsideLevel` and the tone cut above `outsideLp` (Hz) with its door
     * open; `outsideShutLevel` and `outsideShutLp` with the doors shut.
     */
    outsideLevel: 0.45,
    outsideLp: 2500,
    outsideShutLevel: 0.22,
    outsideShutLp: 700,
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
   * The chart, the whiteboard and the duty board at night (render/nightPaper.ts; owner: they
   * were very bright at night). Their brightness: the sky's ambient light times `daylight`,
   * plus the cabin lamp (`cabinWhite` / `cabinRed`), plus the chart lamp (1 by day, `lampNight`
   * at night, turned down), at least `least`, at most `nightMax` at night. At night they go
   * red with the panels (CONFIG.panelLighting redFrom..redTo): green and blue cut by
   * `redGreen` / `redBlue`; with the white cabin light on, only `whiteLightRed` of that.
   */
  nightPaper: { daylight: 1.1, cabinWhite: 0.3, cabinRed: 0.1, lampNight: 0.3, least: 0.04, nightMax: 0.4, redGreen: 0.7, redBlue: 0.85, whiteLightRed: 0.2 },

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
    /**
     * VR hand gestures (player/handGesture.ts): with the grip held on a free hand, the stick
     * pushed forward past `stick` (0..1 of its travel) points the index finger, pulled back
     * past it raises the middle finger.
     */
    gesture: { stick: 0.6 },
    /**
     * The hands' turn on the controller, applied to every hand shape, ours and crew-mates'.
     * The shapes are drawn fingers forward along -z, thumb up +y, the wrist back at +z. The
     * controller's grip frame (the WebXR spec, which the Quest browser follows): a fist round
     * a rod (the handle), -Z along the rod toward the thumb, +X out of the back of the right
     * hand (-X of the left), +Y back along the arm. So the shapes are pitched forward 90°
     * about X (their up to -Z, their back to +Y), and nothing else: `rollDeg` (about Z) and
     * `yawDeg` (about Y) are for fine-tuning, live from Debug > Hands (owner, Oct 2026: a
     * 90° roll as well was wrong).
     */
    handTurn: { pitchDeg: 90, rollDeg: 0, yawDeg: 0 },
  },

  /**
   * The recording camera (player/cameraMode.ts): a desktop player who's a flying camera for
   * filming the others (record the screen with OBS), which a VR player can pick up.
   *   fov            field of view to start with, and its range (deg, vertical)
   *   speeds         flying speeds, slow / normal / fast (m/s; Shift: x3)
   *   smoothTau      smoothing on: the view eases to where you fly and look over this (s)
   *   heldTau        held by a VR player: the view eases onto their hand (s; smooths the network)
   *   grabRange      a VR hand this close to the camera body (m) grips it
   *   lens           the lens in the holder's grip axes (m: up, and forward along the controller)
   *   preview        held in VR, a little screen of its view above it (player/cameraPreview.ts):
   *                  its picture `width` x `height` pixels, drawn `rate` times a second out to
   *                  `far` m; the screen `size` m wide, `above` m over the lens
   */
  camera: {
    fov: 60,
    fovMin: 20,
    fovMax: 100,
    speeds: [1.2, 4, 10] as [number, number, number],
    smoothTau: 0.35,
    heldTau: 0.08,
    grabRange: 0.2,
    lens: [0, 0.035, -0.08] as [number, number, number],
    preview: { width: 192, height: 108, rate: 12, far: 400, size: 0.13, above: 0.1 },
  },

  /**
   * The line-throwing gun (owner, Oct 2026; tow/lineGun.ts, player/handGear.ts kind
   * 'lineGun'): a tug's hand tool for passing a hawser to a ship she can't reach with the
   * boat hook. On its bracket in every tug's wheelhouse (a tug hull or the tug diesel, the
   * Shipyard). Take it, aim at the ship's bow eye and fire: a rocket carries a thin messenger
   * line across; landed by the eye (within `hitRadius` m of it, or aimed within `aimDeg` of
   * it inside `range` m), the ship's crew make it fast and haul the hawser over on it
   * (`haulS` s), and the towline is then fast as if hooked on. A miss splashes; `reloadS` s
   * to the next shot. The rocket flies at `speed` m/s under gravity.
   */
  lineGun: { range: 55, speed: 38, aimDeg: 8, hitRadius: 4, haulS: 6, reloadS: 3 },

  /**
   * Camera views at the helm with a game controller (player/helmCamera.ts; owner, Oct 2026):
   * Y cycles inside, orbit and flyby while you drive from the helm.
   *   orbit   `lengths` of her length off (at least `minDist` m), the right stick turning it
   *           round and up or down at `rate` rad/s between `pitchMin` and `pitchMax`, looking
   *           at her `up` lengths above her origin, eased over `tau` s
   *   flyby   the spot `ahead` m along her course, `offset` m to the side (alternating),
   *           `height` m up; a new spot once she's `behind` m past it or `maxDist` m off;
   *           the look eases over `lookTau` s
   *   zoom    RT / LT held: the orbit distance scaled between `zoomMin` and `zoomMax`, the
   *           flyby lens down to `fovMin` of its field of view, at `zoomRate` (per s, as a log)
   */
  helmCamera: {
    orbit: { lengths: 2.2, minDist: 14, rate: 2.0, pitchMin: 0.06, pitchMax: 1.2, up: 0.12, tau: 0.25, zoomMin: 0.4, zoomMax: 3 },
    flyby: { ahead: 70, offset: 28, height: 7, behind: 25, maxDist: 170, lookTau: 0.12, fovMin: 0.3 },
    zoomRate: 0.9,
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
   * `eyeRange` of your eyes you look through them: two lens circles each `lensDeg` wide,
   * black all round (owner: so nothing outside them is drawn, and the picture, `renderSize`
   * pixels wide and half as high, is the only scene render while you look: it goes out to
   * the full draw distance). Desktop:
   * hold the right mouse button (or Z). The view through them is steadied: it eases onto
   * where you look over `steady` s (VR: the scope's orientation; desktop: the mouse look),
   * since the zoom magnifies every tremor too. 0 is direct.
   */
  binoculars: {
    magnification: 7,
    steady: 0.12,
    stow: [-1.05, 2.6, -1.74] as [number, number, number],
    stowYawDeg: 20,
    grabRange: 0.2,
    eyeRange: 0.2,
    lensDeg: 70,
    renderSize: 1280,
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
    // Just aft of a boat at the Calder Haven cargo berth, 4 m in from the quay edge (owner: it was 25 m forward of her).
    pallet: { x: 716, z: 670.5, yawDeg: 90 },
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
     * the weather (every pot is baited) (`roughFactor` if it's blowing over
     * `roughWind` m/s). Up to `lobsterMax` lobsters and `crabMax` crabs at best. Off any
     * ground the quality is `offGround`. A `bycatch` chance of a small fish, a starfish or
     * (`bootChance` of those) an old boot.
     */
    catch: { lobsterMax: 2, crabMax: 6, offGround: 0.15, roughWind: 11, roughFactor: 0.7, bycatch: 0.25, bootChance: 0.12 },
    /**
     * What the fish buyer pays (career money) for each animal in a pot set down on a harbour
     * quay. Lobster is worth far more than crab.
     */
    price: { lobster: 40, crab: 8 },
    /**
     * Quick potting from the menu (no walking): haul the nearest buoy within `quickHaulRange`
     * m of the hull; a pot shot from the deck lands `quickShootOff` m off her side.
     */
    quickHaulRange: 25,
    quickShootOff: 3,
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
    /** VR: a held piece stays in hand through a loss of the controller's tracking shorter than this (s). */
    lostGrace: 1.0,
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
    /**
     * Size of the panel switches and push buttons (toggle plates and bats, button housings
     * and caps), as a factor of their first, VR-sized build (owner, Oct 2026: "reduce
     * slightly the size of the switches"). 1 = a 70 x 90 mm toggle plate with a 62 mm bat and
     * an 84 mm push button; 0.75 = 53 x 68 mm and a 63 mm button, still well over a
     * fingertip. Only their look: `touchRadius` (how near a hand must come) stays as it was,
     * so they are no harder to press in VR.
     */
    switchScale: 0.75,
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
    /**
     * Desktop: the menu opens flat on the screen (owner: easier to use than floating in the
     * 3D view), the mouse freed to work it; VR and a game controller's aim keep the panel
     * in the world. false: always in the world.
     */
    flatDesktop: true,
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
    // A new world's boat when none is named (the tests and their golden runs). The game starts in CONFIG.career.boat.
    vesselDefId: 'workboat',
  },

  /**
   * Where a new game starts (owner request for v1.0: no start platform or buoys out at sea).
   * The workboat lies moored alongside `berthId` in Calder Haven, the sheltered harbour
   * behind the breakwaters, and you stand on the quay beside her (`quay`: x, z; facing
   * `yawDeg`, 90 = west, toward her). Crew joining a game come aboard her. Tests still
   * start her in open water at the vessel's `spawn`.
   */
  /**
   * Modular boats: each module's own tunables (its defaults; a boat's recipe may override
   * them). docs/MODULAR_BOATS.md.
   */
  modules: {
    /**
     * control.throttle-lever (modules/throttleLever): the combined throttle/gear lever.
     * Travel either side of upright (deg), and the handle's length from its pivot to the
     * knob (m). `detent`: the magnetic neutral notch, as a fraction of full travel either
     * side (0.15: 6 deg each way of the 40). It was 0.06 (2.4 deg), too narrow to find in VR
     * (owner): the lever slipped through into ahead or astern. Inside it the lever sends
     * exactly 0, so the gearbox is in neutral. `detentHold`: once in, it holds until pushed
     * this much further past the notch's edge (it's sticky, so a hand resting on it doesn't
     * pop it out). `click` / `release`: the haptic pulse going into the notch (firm) and
     * out of it (light): strength 0..1 and length (ms).
     */
    throttleLever: {
      maxAngleDeg: 40,
      length: 0.2,
      detent: 0.15,
      detentHold: 0.06,
      click: { strength: 1, ms: 70 },
      release: { strength: 0.4, ms: 25 },
      engrave: 'AHEAD ▲  ▼ ASTERN',
    },

    /**
     * console.standard (modules/console): the helm console's dash, pedestals and group
     * plates, and its SLOTS: where each control and screen sits. All positions are from the
     * console's reference point (its top, on the centreline, at its aft face; on the
     * workboat vessels.workboat.bridge.console): x to starboard, y up, -z forward (m).
     * Which module goes in which slot is the recipe's business.
     *   dash       the instrument dash across the front: a box, screens on its aft face
     *              (tilted back `tiltDeg`)
     *   pedestals  small pedestals jutting aft from the console under the throttle and the
     *              two joysticks, so they fall to hand from the helm (owner feedback: on the
     *              console top the throttle was too far forward in VR): their x, half-width,
     *              fore-aft extent and how far down the floor is
     *   groups     the switch row's colour-coded plates (owner request: group like with
     *              like): title, x extent, the colour of the strip along the forward edge
     *              (the title sits on it); `plates` their fore-aft extent
     * The workboat's switch row, port to starboard:
     *   LIGHTS        nav lights, cabin light, wipers (port end)
     *   SEARCH · FIRE the fire pump and searchlight switches, each just ahead of its own
     *                 joystick on the two port pedestals (left hand aims, right hand keeps
     *                 the throttle)
     *   horn          on its own, just left of the wheel
     *   DECK          anchor, trawl (and SKIFF CRANE): behind the throttle
     *   ENGINE        HEAT and START (hold), the key, the warning lamps ahead of them; the
     *                 laminated start-up card below, on the console's upright face
     * Screens on the dash: speed, heading, rpm, rudder, and the engine monitor in the centre,
     * behind the wheel (read through the spokes). `instrumentsAmps`: the console's
     * instruments (screens, lamps, their electronics) on the INSTR circuit (M4a).
     */
    helmConsole: {
      instrumentsAmps: 2.5,
      dash: { front: -0.5, aft: -0.34, bottom: 0, top: 0.41, halfWidth: 1.25 },
      pedestals: { x: [0.45, -0.45, -0.85], halfWidth: 0.13, front: -0.08, aft: 0.3, floor: -0.95 },
      groups: [
        { title: 'LIGHTS', x: [-1.32, -0.91] as [number, number], color: 0xd8b028 },
        { title: 'SEARCH · FIRE', x: [-0.89, -0.38] as [number, number], color: 0xc0402a },
        { title: 'DECK', x: [0.19, 0.72] as [number, number], color: 0x2f6fd0 },
        { title: 'ENGINE', x: [0.74, 1.32] as [number, number], color: 0x3a9a4a },
      ],
      plates: { front: -0.27, aft: -0.05 },
      slots: {
        /** The wheel: its centre, its plane tilted back toward the helmsman. */
        wheel: { position: [0, 0.17, 0.12], rotationDeg: [-22, 0, 0] },
        throttle: { position: [0.45, 0.01, 0.17] },
        navLights: { position: [-1.29, 0.01, -0.2] },
        cabinLight: { position: [-1.14, 0.01, -0.2] },
        wipers: { position: [-0.99, 0.01, -0.2] },
        firePump: { position: [-0.82, 0.01, -0.2] },
        spotlight: { position: [-0.48, 0.01, -0.2] },
        horn: { position: [-0.28, 0.01, -0.2] },
        anchor: { position: [0.39, 0.01, -0.2] },
        trawl: { position: [0.52, 0.01, -0.2] },
        heat: { position: [0.8, 0.01, -0.18] },
        start: { position: [0.94, 0.01, -0.18] },
        key: { position: [1.08, 0.01, -0.18] },
        lamps: { position: [0.95, 0.015, -0.28] },
        /**
         * The laminated start-up card: upright on the console's aft face below the ENGINE
         * group, facing the helmsman (owner: on the dash top it glowed white at night; down
         * here, on the panel lighting, it dims and goes red with the instruments).
         */
        card: { position: [1.12, -0.31, 0.005] },
        spotJoystick: { position: [-0.45, 0.01, 0.17] },
        monJoystick: { position: [-0.85, 0.01, 0.17] },
        speed: { position: [-0.95, 0.21, -0.34] },
        heading: { position: [-0.52, 0.21, -0.34] },
        rpm: { position: [0.52, 0.21, -0.34] },
        rudder: { position: [0.95, 0.21, -0.34] },
        engineMonitor: { position: [0, 0.21, -0.34] },
      } as Record<string, { position: [number, number, number]; rotationDeg?: [number, number, number] }>,
    },

    /** control.wheel: rim radius (m) and turns lock to lock (direct steering: no lag). */
    wheel: { radius: 0.22, turnsLockToLock: 1.5 },

    /**
     * control.joystick: a spring-centred stick driving something at a RATE (the searchlight,
     * the fire monitor): deg/s at full deflection. Its travel limits are its keys' ranges.
     * The workboat's fire-monitor joystick pans at 40 deg/s (her recipe).
     */
    joystick: { panRateDeg: 50, tiltRateDeg: 22 },

    /**
     * deck.crane (modules/deckCrane): a placeable hydraulic deck crane for cargo (owner),
     * independent of the skiff's crane. A column that slews on a plinth, a boom that luffs
     * from its head, a wire and hook hanging from the boom's tip. Worked from a control post
     * at its foot: a joystick (sideways slews, fore-aft raises and lowers the boom; the
     * crane follows at its own rates, only with hydraulic pressure) and HOIST UP / DOWN and
     * HOOK buttons. Sizes in m, rates in deg/s and m/s. The load hangs rigid under the hook
     * (no swing: owner's choice, no new rope physics); its weight acts on the boat there.
     */
    deckCrane: {
      plinthHeight: 0.25,
      plinthRadius: 0.24,
      columnHeight: 1.6,
      columnRadius: 0.13,
      boomLength: 3.4,
      boomDepth: 0.15,
      slewRateDeg: 25,
      luffRateDeg: 12,
      /** Slew stops either side of straight ahead (deg), and the boom's range (deg above level). */
      slewLimitDeg: 170,
      luffMinDeg: -5,
      luffMaxDeg: 70,
      hoistRate: 0.35,
      wireMin: 0.4,
      wireMax: 6,
      /**
       * Safe working load (kg), and the crane's own weight (kg). The SWL holds out to the base
       * boom's own reach (`boomLength`); further out, the boom run out, it lifts less: the
       * same load moment (load x reach). The crane won't take a load past its moment, and
       * stops running the boom out or down when the load on the hook reaches it.
       */
      swlKg: 800,
      massKg: 420,
      /**
       * The telescopic boom (owner: to reach out over the deck): an inner section runs out of
       * the boom's tip up to `extendMax` (m) at `extendRate` (m/s), on BOOM OUT / BOOM IN.
       */
      extendMax: 2.0,
      extendRate: 0.3,
      /** Where it rests: boom slewed and luffed to these, the wire this long, the boom run in. */
      stow: { slewDeg: 0, luffDeg: 5, wire: 0.8 },
      /**
       * Which side it stands (owner: keep the working deck clear): 'auto' moves it from a
       * centreline socket out to the starboard deck edge, and leaves it on a socket that's
       * already off to one side; 'port' / 'starboard' choose; 'socket' keeps it exactly on its
       * socket. At the edge its column stands `edgeInset` (m) in from the deck edge.
       */
      side: 'auto' as 'auto' | 'port' | 'starboard' | 'socket',
      edgeInset: 0.55,
      /**
       * The control post beside the column (z aft of it), its height, and its desk's size (m).
       * `x`: how far to the side of the column; at the edge the post stands inboard of it (on
       * a 'socket' crane, + is the socket's starboard).
       */
      // `stickSpacing`: between its two joysticks (m).
      post: { x: 0.55, z: 0.45, height: 1.05, deskWidth: 0.56, deskDepth: 0.3, stickSpacing: 0.3 },
      /** The radio remote on its hook on the post's near side (app/craneRemote.ts): its size, its height on the post (m). */
      remote: { width: 0.18, height: 0.11, depth: 0.05, y: 0.82 },
      /** How close the hook must be to an item's lifting point to take it (m). */
      hookReach: 0.6,
      /**
       * Motion compensation (a career upgrade, 'craneComp'): while there's hydraulic pressure
       * the crane holds its hook still against her roll, pitch and heave, as if she were
       * upright and steady: it follows only her heading and her height averaged over
       * `settleS` (s), so you still place the hook yourself. It can move the hook up to
       * `stroke` (m) from where it would hang uncompensated (its rams' and wire's travel).
       */
      motionComp: { stroke: 1.2, settleS: 8 },
    },

    /**
     * The deck pole (owner): the searchlight or the fire monitor fitted on the working deck
     * instead of the wheelhouse roof stands on a steel pole, high enough to see and shoot over
     * the bulwarks and people's heads, with a control box at hand height on its aft side (a
     * joystick and the unit's switch, and the monitor's FIRE gauge), so it can be worked from
     * beside it, facing forward like at the helm. Heights above the deck at the pole (m).
     * Shipyard designs place them `fromHouse` forward or aft of the house, `inset` in from the
     * deck edge: the searchlight to starboard, the monitor to port.
     */
    deckPole: {
      lampHeight: 2.5,
      nozzleHeight: 2.3,
      boxHeight: 1.05,
      radius: 0.05,
      /** The control box: width (athwartships), depth (fore and aft), height (m). */
      box: { width: 0.36, depth: 0.22, height: 0.12 },
      fromHouse: 0.75,
      inset: 0.3,
    },

    /**
     * hull.guard (modules/hullGuard): permanent protection along her sides (owner: a Shipyard
     * choice beside the crew's fenders). Sizes in m; masses in kg.
     *   strake  a solid rubber D-section along her sheer, all round (round the transom and,
     *           on a bow without a ramp, the stem): `radius` of its half-round, on the corner
     *           of her deck edge, its centre `drop` below it; it weighs `kgPerM` a metre.
     *           Probed every `spacing` along her (the contact points).
     *   tyres   old lorry tyres in a close row along each side (as on tugs and pushboats:
     *           nearly touching, held by a wire through them along the gunwale), plumb
     *           against her deck edge (covering it: the widest of her): outer `radius`,
     *           `thickness` (side to side), their centres `drop` below the deck edge,
     *           `spacing` apart (a tyre's width and a little: they all but touch), over the
     *           part of her at least `minBeam` of her widest deck half-beam (not right up
     *           into the fine bow); `hole`: the radius of the hole through the middle. One
     *           more on her stem, facing forward, for pushing (a bow without a ramp). `kgEach` each. Hanging low, they catch spray and
     *           the odd wave: her form factor (friction resistance) is raised by
     *           `formFactorAdd` (Shipyard build).
     */
    /**
     * hull.push-fender (modules/pushFender): the push knees on a tug's square bow (owner: the
     * small tug hull; two separate vertical pads look better than one block across). Each a
     * column of rubber `kneeWidth` m wide and `thickness` m thick, its outer corners chamfered
     * by `chamfer`, its centre `kneeAt` of the way out from her centreline to `inset` inside
     * her side, from the bulwark top down to `clear` above the foot of the plate; the bow
     * plate shows between them. `knees` of them. Each weighs `kgPerM2` per square metre of face
     * (a heavy-duty rubber section), and is probed on its face at `across` x `up` points
     * against quays and other boats.
     */
    pushFender: { knees: 2, kneeWidth: 0.6, kneeAt: 0.55, thickness: 0.32, chamfer: 0.08, inset: 0.06, clear: 0.05, kgPerM2: 140, across: 2, up: 3 },

    hullGuard: {
      strake: { radius: 0.07, drop: 0.06, kgPerM: 5, spacing: 0.6 },
      tyres: { radius: 0.45, hole: 0.21, thickness: 0.28, drop: 0.4, spacing: 0.92, minBeam: 0.45, kgEach: 45, formFactorAdd: 0.03 },
    },

    /** instrument.warning-lamps: the lamps' spacing (m). */
    warningLamps: { spacing: 0.066 },

    /** furniture.start-card: the laminated start-up card (m). */
    startCard: { width: 0.19, height: 0.26 },

    /**
     * instrument.screen: a screen on the shared display atlas (controls/instruments.ts).
     *   dash  on a dash face, tilted back `tiltDeg`, standing just proud of it
     *   hung  hung from the roof on a bracket `bracket` m long, its face tilted down
     *         toward the helm `tiltDeg`, in a housing (the workboat's NAV / WIND)
     */
    screen: {
      dash: { width: 0.38, height: 0.22, tiltDeg: 14 },
      hung: { width: 0.44, height: 0.22, tiltDeg: 58, bracket: 0.15 },
    },

    /**
     * panel.overhead (M3b): the switch panel hung under the wheelhouse roof. Its box hangs
     * `drop` m from the roof down to its face (where its socket is). Its `slots` are along
     * the face (x, m from its centre): switches hang upside down from it (`hang`), pressed
     * from below; the FM set's display lies flat on it. Its `legends` are engraved on the
     * underside just aft of each control (`legend`: their size and how far aft, m),
     * readable from the helm looking up.
     */
    overheadPanel: {
      width: 0.82,
      depth: 0.2,
      drop: 0.08,
      slots: {
        deckFore: { x: -0.32, hang: true },
        deckAft: { x: -0.21, hang: true },
        railLights: { x: -0.1, hang: true },
        fm: { x: 0.11, hang: false },
      },
      legends: [
        { text: 'FOREDECK', x: -0.32 },
        { text: 'AFT DECK', x: -0.21 },
        { text: 'RAIL', x: -0.1 },
        { text: 'FM', x: 0.27 },
        { text: 'TUNE', x: 0.36 },
      ],
      legend: { size: [0.09, 0.0225] as [number, number], offset: 0.07 },
    },

    /**
     * radio.fm (M3b): the FM set in the overhead panel. Its display (m) faces down; its
     * power switch and TUNE button hang beside it (x from the display's centre, m). The
     * stations are CONFIG.fmRadio's.
     */
    /**
     * radio.fm: the FM set. On its own under a cabin roof (not in a panel), it hangs in a
     * small `housing` box (width, height, depth; centred `housingX` along it to cover the
     * display and controls), on a strap up to the roof.
     */
    fmRadio: { display: { width: 0.17, height: 0.064 }, power: 0.16, tune: 0.25, tuneColor: 0xd88a2a, amps: 1.0, housing: { width: 0.44, height: 0.07, depth: 0.12 }, housingX: 0.08 },

    /**
     * panel.breakers (M3b): the voltmeter and a breaker for each circuit, with a green lamp
     * that shows the circuit is live. Panel face size (m); the dial's centre (from the
     * panel's left edge and centre line) and radius; breakers in rows of `perRow`, the first
     * `x0` from the left edge, `pitch` apart, rows at `rows` (y), drawn at `scale` of a
     * console switch. `circuits`: which breaker in which place, and its engraving. `amps`:
     * the panel itself, with the master on (M4a).
     */
    breakerPanel: {
      amps: 0.4,
      width: 0.54,
      height: 0.32,
      dial: { x: 0.1, y: 0.02, radius: 0.075 },
      breakers: { x0: 0.235, pitch: 0.078, rows: [0.075, -0.075], perRow: 4, scale: 0.8 },
      circuits: [
        { name: 'instruments', engrave: 'INSTR' },
        { name: 'chart', engrave: 'CHART' },
        { name: 'radio', engrave: 'RADIO' },
        { name: 'navLights', engrave: 'NAV LTS' },
        { name: 'deckLights', engrave: 'DECK LTS' },
        { name: 'bilge', engrave: 'BILGE' },
        { name: 'hydraulics', engrave: 'DECK HYD' },
      ],
    },

    /**
     * panel.helm-assist (owner, Oct 2026; modules/helmAssist): a small box by the breaker panel
     * with three buttons, AUTO START, DOCK and AUTOPILOT. `width`, `height` (m), `pitch` between
     * the buttons, `amps` with the master on (INSTRUMENTS circuit; it works only with it live).
     * `gap`: how far aft of the breaker panel it hangs (m, between their edges).
     * `autopilot` (vessel/autopilot.ts): it steers to hold her heading as a helmsman would, the
     * wheel turned in proportion to how far she is off her heading (`helmPerDeg`, helm travel
     * per degree off) less how fast she is already swinging back (`helmPerDegS`, per degree a
     * second: so she doesn't overshoot), never more than `maxHelm` of the wheel's travel.
     */
    helmAssist: { width: 0.3, height: 0.14, pitch: 0.085, amps: 0.6, gap: 0.04, autopilot: { helmPerDeg: 0.04, helmPerDegS: 0.25, maxHelm: 0.5 } },

    /** radio.vhf (M3c): the VHF set hung from the roof; how far its face tilts down toward you; its draw (A, RADIO circuit). */
    vhf: { tiltDeg: 35, amps: 1.5 },

    /** nav.chartplotter (M3c): the chartplotter hung from the roof; its screen's tilt; its draw (A, CHART circuit). */
    chartplotter: { tiltDeg: 35, amps: 2.0 },

    /**
     * furniture.chart-table (M3c): the drop-leaf chart table on a wall. From its socket (the
     * leaf's hinge corner on the floor, at the wall: x out from the wall, z aft): its size
     * (m), the pen holder [x, z], the lamp (on a stalk on the table: its base by the wall edge
     * [x, z], its height above the table, its shade over the chart [x, z]) and the lamp switch on the batten [x, z]. `lampAmps`:
     * the lamp's draw (A, DECK LTS circuit; M4a).
     */
    chartTable: {
      lampAmps: 0.5,
      width: 0.75,
      depth: 0.95,
      height: 0.95,
      holder: [0.07, 0.87] as [number, number],
      lamp: { base: [0, 0.42] as [number, number], height: 0.5, head: [0.39, 0.42] as [number, number] },
      lampSwitch: [0.03, 0.89] as [number, number],
    },

    /** furniture.duty-board (M3c): the duty board's face (m). */
    dutyBoard: { width: 0.72, height: 0.54 },

    /**
     * furniture.whiteboard (M3c): the crew whiteboard's face (m). Hung from a cabin roof
     * (owner: not low on a wall) it's a pull-down board, like a projector screen: rolled up
     * in a `roller` box (`box` deep) under the roof, unrolled (`width` x `height`, a little
     * bigger) by its handle in `rollS` seconds.
     */
    whiteboard: { width: 0.85, height: 0.62, roller: { width: 1.1, height: 0.8, box: 0.09, rollS: 1.0 } },

    /** tool.oil-can (M3c): the can drawn at this fraction of its model's size. */
    oilCan: { scale: 0.85 },

    /**
     * propulsion.diesel-inboard (M4a): the 12 V side of the engine (A): the alternator's full
     * output (from idle), and what the starter and the glow plugs draw (on the master
     * alone). Its engine, propeller and oil use are the workboat's (CONFIG.vessels.workboat:
     * engine, propeller, maintenance.use) until the boat is built entirely from JSON (M6).
     */
    dieselInboard: {
      alternatorAmps: 60,
      starterAmps: 180,
      glowAmps: 35,
      /**
       * Dry mass with its gearbox (kg; M6): a 400 kW heavy-duty six. It counts at its bed;
       * the hull's lightship is the weighed boat less this and the batteries (modular/
       * massProperties.ts), so the starter boat weighs and trims as before.
       */
      massKg: 1300,
    },

    /**
     * propulsion.outboard (owner, Oct 2026: "an outboard engine module for the Shipyard...
     * 2, 3 or 4 outboards"): petrol V8 outboards on a bracket off the transom, worked
     * together from one lever and one key, steered by swinging them with the wheel (no
     * rudder). Each one's figures are the Alaskan 38's, tuned by sea trial (26 kn with two
     * on her 9.2 t):
     *   engine      300 kW (400 hp), idling at 650 rpm, rated 5800; a petrol engine's torque
     *               curve (flat from 2500 to 5400 rpm, falling off past its rated speed), a
     *               light flywheel, a quick starter, no glow plugs (`preheatTime` 0: the
     *               HEAT button does nothing, and she starts cold as warm). It burns from
     *               her tank as the diesels do (the game has one fuel; petrol at the fuel
     *               berth is for later), at petrol's 0.74 kg/L. Its fuel and heat
     *               figures are the ones she was tuned with (more fuel per kWh heats it
     *               into its derate flat out).
     *   gearRatio   2.0: the lower unit's bevel gears, the engine at 5800 turning the
     *               propeller at 2900 rpm.
     *   propeller   0.4 m (a 16 in prop), light and fast; each unit's (the module draws and
     *               places it: its `position` is worked out from `mount` and `look`).
     *   steering    the units swing together up to `maxAngleDeg` either way at `rateDegPerS`
     *               (hydraulic steering), each pushing along its own heading; their lower
     *               units (`legArea` each, the gearcase and skeg below the water) steer a
     *               little as a rudder does from the water flowing past them.
     *   spacing     the units' centres across the transom (m): about what two 400 hp
     *               outboards need to turn lock to lock without touching.
     *   look        each unit's size (m): the cowl; the shaft from the mount's top down to
     *               the anti-ventilation plate (a 30 in long shaft); the gearcase below it
     *               to the propeller's centre; how far aft of the mount the steering pivot
     *               and the propeller are (straight).
     *   bracket     the Shipyard's bracket off the transom that carries them: how far aft it
     *               reaches, its top below the mount, and the margin past the outer units.
     *   massKg      each one, dry (about what a 400 hp V8 outboard weighs).
     *   pricePerKw  GBP per kW.
     */
    outboard: {
      engine: {
        powerKw: 300,
        idleRpm: 650,
        ratedRpm: 5800,
        torqueCurve: [[0, 0], [800, 260], [1500, 420], [2500, 520], [3500, 560], [4500, 540], [5400, 500], [5800, 440], [6200, 200], [6400, 0]] as [number, number][],
        frictionTorque: 20,
        frictionPerRpm: 0.01,
        inertia: 0.35,
        droopRpm: 300,
        rackRiseRate: 2.5,
        starterTorque: 120,
        starterMaxRpm: 400,
        crankTime: 0.8,
        startOnlyInNeutral: true,
        preheatTime: 0,
        preheatHotTime: 0,
        unheatedExtraCrank: 0,
        coldBelowC: 40,
        glowCoolRate: 0.25,
        gearRatio: 2.0,
        /** The lower units made: the design's gear step is held to this range of ratios (build.ts). */
        gearRange: [1.5, 2.4] as [number, number],
        gearEfficiency: 0.96,
        shiftDelay: 0.6,
        neutralBand: 0.08,
        trollingLever: 0.3,
        trollingMinShaft: 0.3,
        fuel: { tankL: 1100, startL: 800, sfcGPerKWh: 230, partLoadPenalty: 0.3, densityKgPerL: 0.74, lowFraction: 0.1, refuelRateLps: 2.5 },
        thermal: {
          heatToCoolant: 0.3,
          lhvMJPerKg: 42.7,
          heatCapacity: 40,
          thermostatOpenC: 80,
          thermostatFullC: 88,
          /** Sized for its 300 kW held flat out (the Shipyard's 1.7 kW/K per 150 kW); 2.4 ran it to 113 °C. */
          exchangerKwPerK: 3.4,
          pumpFlowExp: 1,
          lugHeat: 1,
          baseLossKwPerK: 0.012,
          faultExchangerFraction: 0.08,
          alarmC: 95,
          derateStartC: 100,
          derateFullC: 110,
          derateRack: 0.3,
          shutdownC: 115,
          oilLagS: 45,
          oilLoadRiseC: 12,
        },
      },
      propeller: {
        diameter: 0.4,
        kt0: 0.45,
        j0: 1.25,
        kq0: 0.07,
        jq0: 1.35,
        asternEfficiency: 0.5,
        asternTorque: 0.9,
        inertia: 0.03,
        wake: 0.03,
        thrustDeduction: 0.05,
        position: [0, 0, 0] as [number, number, number],
        rightHanded: true,
        propWalkAhead: 0,
        propWalkAstern: 0,
        propWalkFadeSpeed: 1.5,
      },
      steering: { maxAngleDeg: 30, rateDegPerS: 45, legArea: 0.09 },
      spacing: 0.7,
      look: { cowlWidth: 0.55, cowlHeight: 0.75, cowlLength: 0.85, legWidth: 0.25, shaftLength: 0.8, gearDrop: 0.25, pivotAft: 0.15, propAft: 0.8 },
      bracket: { length: 0.75, belowMount: 0.2, margin: 0.4 },
      massKg: 380,
      alternatorAmps: 60,
      starterAmps: 120,
      pricePerKw: 130,
    },
    /**
     * Stern drives (owner, Oct 2026: "so that engines can go right up the back"): the
     * inboard engine package against the transom, level, driving an outdrive leg through it
     * that swings to steer (modules/outboard, `sterndrive`: the outboards' steering, no
     * rudder). A twin installation has a leg each.
     *   transomInset  the engine's gearbox end this far forward of the transom (the leg's
     *                 bell housing through it)
     *   legKg, price  each leg (with its gimbal housing and the transom shield), and what it adds
     *   propMaxM      the leg's propeller no bigger than this (a high-revving one: its own gears)
     *   look          the leg's (outboard look keys): its steering axis `pivotAft` of the
     *                 transom, the propeller `propAft` of that; its length is worked out (the
     *                 anti-ventilation plate level with her bottom at the transom)
     */
    sternDrive: {
      transomInset: 0.15,
      legKg: 160,
      price: 9000,
      propMaxM: 0.55,
      look: { cowlWidth: 0.45, cowlHeight: 0, cowlLength: 0.5, legWidth: 0.2, shaftLength: 0.6, gearDrop: 0.22, pivotAft: 0.3, propAft: 0.6 },
    },

    /**
     * Pod drives (owner, Oct 2026: for the planing hulls; modules/pods): two steerable drive
     * units hung under her bottom, forward of the transom, each driven by its own inboard engine
     * just forward of it. Each pod's propellers are at its FRONT and pull (a tractor drive: they
     * work in clean water, ahead of the strut). The pods swing to steer, as one with the wheel,
     * and with the advanced controls a JOYSTICK button hands them to the helm joystick.
     *   forwardOfTransom  each pod's steering axis this far forward of the transom (m); its
     *                     engine's gearbox end over it
     *   legKg, price      each pod (its strut, nacelle, gears and twin propellers), and what it adds
     *   propMaxM          its propellers no bigger than this (they turn fast: the pod's own gears).
     *                     The two in tandem are modelled as one of this diameter, the disc they
     *                     work together (0.55 m was too small to take 400 kW: 30 kn on the pilot
     *                     boat against 38 on shafts; at 0.65, 35 kn)
     *   steering          from the wheel: up to `maxAngleDeg` either way at `rateDegPerS`; each
     *                     strut's side area `legArea` steers as a rudder from the water past it
     *   look              (m) the strut from her bottom down to the nacelle's centre, `strutLength`
     *                     (the propellers' tips clear of her bottom: worked out from the diameter,
     *                     never less), `strutChord` long, `strutWidth` thick; the nacelle `podLength`
     *                     long, `podRadius` round; its propellers `propFwd` forward of the axis
     *   joystick          vector mode (the helm joystick; physics/podAllocation.ts):
     *     maxAngleDeg     each pod swings this far either way on its own (further than from the
     *                     wheel), at `rateDegPerS`
     *     lever           both engines' throttle at the stick's stop (0..1 of the lever's travel:
     *                     low, it's for berthing)
     *     slip            over the first share of the stick's travel the engines idle in gear and
     *                     the pods' clutches slip, giving that share of their idling push (fine
     *                     control close in); past it the throttle opens
     *     side, surge, twist  how hard each way of the stick asks (a share of one pod's push;
     *                     twist: of one pod's push at the pods' half spacing, as a turning moment)
     *     turnRateDeg     the twist at its stop asks for this rate of turn (deg/s); the pods
     *                     turn her to it, `turnGain` (per rad/s of error) giving full twist for
     *                     an error of 1/turnGain, and hold her head (no turn) while she crabs
     */
    pods: {
      forwardOfTransom: 1.3,
      legKg: 260,
      price: 24000,
      propMaxM: 0.65,
      steering: { maxAngleDeg: 26, rateDegPerS: 40, legArea: 0.14 },
      look: { strutLength: 0.45, strutChord: 0.6, strutWidth: 0.12, podLength: 1.25, podRadius: 0.14, propFwd: 0.62 },
      joystick: { maxAngleDeg: 50, rateDegPerS: 60, lever: 0.5, slip: 0.4, side: 1, surge: 1, twist: 2, turnRateDeg: 6, turnGain: 60 },
    },

    /** electrical.battery-bank (M6): each 12 V 100 Ah battery's mass (kg). */
    batteryBank: { massKg: 28 },

    /** pump.bilge (M4a): it runs with water over its float switch (`floatAt`, 0..1), drawing `amps` (BILGE circuit). */
    bilgePump: { floatAt: 0.01, amps: 3 },

    /** hydraulics.pto-pump (M4a): its clutch and the machines' valve solenoids, while there's pressure (A, DECK HYD circuit). */
    ptoPump: { amps: 4 },

    /** deck.searchlight (M5b): its draw while on (A, deck lights' circuit). */
    searchlight: { amps: 12 },

    /**
     * mount.mast (M5b): the signal mast on the wheelhouse roof (its look was the hull's).
     * A square pole at (x, z) from the roof up to `height` above the roof's underside, a
     * yard across it `yardHeight` up, `yardSpan` wide; the wind sock at its head.
     * `keepClear`: the half-size of the square round its foot you can't walk into.
     */
    mast: { x: 0, z: 0.4, size: 0.12, height: 1.7, yardHeight: 1.3, yardSpan: 0.9, yardDepth: 0.08, keepClear: 0.25 },

    /**
     * light.navigation's light mast (owner, Oct 2026: the masthead light hung in the air above
     * the roof on boats without the workboat's signal mast): a slim square pole `size` wide
     * from the roof up to the masthead light; `keepClear` as the mast's.
     */
    lightMast: { size: 0.06, keepClear: 0.15 },

    /**
     * deck.anchor-windlass (M5a): the windlass's draw while it runs (A, on the master alone).
     * Placeable (owner): its socket is the bow roller (the hawse, where the chain leaves
     * her), the chain leading out along the socket's forward (-z); on a socket turned to
     * face aft it's a stern (kedge) anchor. `draw`: draw the roller and the windlass (the
     * starting workboat's are part of her bow, so her recipe turns it off). The roller
     * `roller` m long in its cheeks; the windlass `aft` m behind it on the deck: a motor
     * housing `box` (w, h, d) and the gypsy wheel on it, radius `gypsy`.
     */
    anchorWindlass: { amps: 60, draw: true, roller: 0.32, aft: 0.75, box: [0.34, 0.26, 0.3] as [number, number, number], gypsy: 0.11 },
  },

  /**
   * Refuelling by hand (fuel/fuelHose.ts; owner, Oct 2026): each harbour's fuel pump has a
   * hose. Take the nozzle from its holster (grip it; desktop: click), walk it out to the
   * boat, plug it into her filler (let go of it there, or pull the trigger; desktop: click
   * the filler), walk back and press START on the pump; STOP, or it stops when she's full.
   * Then take the nozzle out and hang it back on the pump. No collisions: the hose is drawn
   * only (as the towline is, hanging in a curve and lying on the ground).
   *   reach       how far the nozzle goes from the pump (m, flat): carried further, it stays
   *               at the end of the hose; plugged in, a boat that drifts `pullOut` m past it
   *               pulls the nozzle out (it falls on the quay) and the pump stops
   *   hoseLength  the hose as drawn (m): longer than `reach`, so it sags and lies on the ground
   *   pump        the pump, in its own axes (x across its face, y up, z out of its face, which
   *               looks at the fuel berth): size (w, h, d), where the hose comes out
   *               (`outlet`), the nozzle's holster, the gauge and the START / STOP buttons
   *   filler      each boat's filler: on the side deck, both sides, `aft` m aft of her
   *               wheelhouse (of her middle without one), `inset` m in from the deck edge
   *   grab        a hand within this of the nozzle grips it, of a button presses it, and a
   *               nozzle let go within `plug` of a filler (or the holster) goes in (m)
   *   desk        desktop reach for clicks (m), and where the nozzle rides in the "hand"
   *               (m right, up, forward of the eyes)
   */
  fuelHose: {
    reach: 10,
    pullOut: 1.5,
    hoseLength: 11,
    pump: {
      size: [0.6, 1.6, 0.45] as [number, number, number],
      outlet: [0.31, 0.7, 0.12] as [number, number, number],
      holster: [-0.18, 1.0, 0.24] as [number, number, number],
      gauge: [0, 1.24, 0.226] as [number, number, number],
      start: [0.1, 1.0, 0.24] as [number, number, number],
      stop: [0.22, 1.0, 0.24] as [number, number, number],
    },
    filler: { aft: 0.4, inset: 0.3 },
    grab: 0.3,
    button: 0.12,
    plug: 0.4,
    desk: { reach: 3.2, hand: [0.18, -0.3, 0.55] as [number, number, number] },
  },

  /**
   * Voyage mode (mode.ts, world/maps.ts; owner, Oct 2026): a real-coastline map on its own,
   * no career, no saves. `boat`: the boat it starts in (any other by Start in, a Shipyard
   * code or a design file), fitted out in full.
   */
  voyage: {
    boat: 'fishingBoat',
  },

  start: {
    berthId: 'calder-cargo',
    quay: { x: 713, z: 661.5, yawDeg: 90 },
  },

  /**
   * Engine voices: how each kind of diesel sounds (audio/engineAudio.ts, audio/dieselWorklet.ts).
   * A boat's diesel module names one in its config (`voice`); without one it's `inlineSix`.
   *   cylinders      a four-stroke fires cylinders/2 times a revolution: the beat's pitch
   *   strength       each firing's loudness, in firing order (the cycle's lumpy rhythm)
   *   jitter         +- random spread on each firing's loudness
   *   grit           how much of each pulse is noise (0.08 if left out)
   *   mech           level of that noise in `mechBand` (Hz, from and to; 400 to 1400 if
   *                  left out), beside the tone: the engine's mechanical clatter riding on
   *                  each firing (0: none)
   *   pulseTau       how long each exhaust pulse rings (s), + pulseTauLow more at idle
   *   body, stack    the exhaust's two resonances (peaking filters: Hz, Q, dB)
   *   lp             the tone's low-pass: base + rpm * (rpm / rated) + load * load (Hz)
   *   thump          its level: base + rpm * (rpm / rated) + load * load
   *   drive          soft-clip saturation (grit under load)
   *   hiss           intake / exhaust rush: base + load * load * rpm fraction
   *   turbo          a turbocharger's whine (a sine, Hz from idle to full boost) at `gain`
   *                  under full boost; null if naturally aspirated
   */
  engineVoices: {
    /**
     * The workboat's 400 kW engine: a worn, naturally aspirated straight six, dark and
     * round, its cylinders noticeably unequal so it lopes once a cycle. Tuned with the owner
     * against a recording of a similar boat: nothing above a few hundred Hz.
     */
    inlineSix: {
      cylinders: 6,
      strength: [1.0, 0.48, 1.1, 0.55, 1.03, 0.46],
      jitter: 0.1,
      grit: 0.08,
      mech: 0,
      mechBand: null as readonly [number, number] | null,
      pulseTau: 0.013,
      pulseTauLow: 0.006,
      body: { freq: 110, q: 0.9, gain: 4 },
      stack: { freq: 150, q: 2.2, gain: 3 },
      lp: { base: 150, rpm: 120, load: 180 },
      thump: { base: 0.65, rpm: 0.25, load: 0.35 },
      drive: 1.25,
      hiss: { base: 0.002, load: 0.008 },
      turbo: null as { idleHz: number; boostHz: number; gain: number } | null,
    },
    /**
     * The landing craft's 280 kW engine: a turbocharged V8, newer and evener than the
     * workboat's six. Eight cylinders fire four times a revolution (40 Hz at idle, 120 Hz
     * flat out, against the six's 30 / 90 Hz), so it's busier; what keeps it deep is the
     * V8 burble: in its firing order (1-5-4-2-6-3-7-8, odd cylinders on the port bank)
     * the banks take turns unevenly (P P S S S P P S), and the louder port bank's pulses
     * bunch up, so a low lope runs under the beat. A bigger exhaust: both resonances a
     * little lower, a touch more saturation under load. Its turbo whines faintly with boost
     * (set `turbo.gain` to 0 to lose it).
     */
    v8: {
      cylinders: 8,
      strength: [1.0, 0.94, 0.58, 0.55, 0.6, 1.03, 0.97, 0.56],
      jitter: 0.12,
      grit: 0.08,
      mech: 0,
      mechBand: null as readonly [number, number] | null,
      pulseTau: 0.011,
      pulseTauLow: 0.005,
      body: { freq: 85, q: 0.9, gain: 5 },
      stack: { freq: 132, q: 2.0, gain: 3 },
      lp: { base: 160, rpm: 140, load: 200 },
      thump: { base: 0.55, rpm: 0.3, load: 0.4 },
      drive: 1.4,
      hiss: { base: 0.002, load: 0.01 },
      turbo: { idleHz: 1400, boostHz: 3200, gain: 0.006 } as { idleHz: number; boostHz: number; gain: number } | null,
    },
    /**
     * The tug diesel, the big straight six (owner, Oct 2026: "a better engine noise for the
     * big straight six diesel"; "still sounds like a single cylinder"; then, with a phone
     * recording of "an actual 6 cylinder marine diesel" idling: this voice is that one's,
     * and only the big straight six's). The recording, analysed (PROGRESS.md): it fires 70
     * times a second, very evenly (the lines half-way between the firing's, which unequal
     * cylinders make, are 35 to 48 dB down), its third harmonic (210 Hz) the loudest, the
     * fundamental 6 dB and the second 11 dB under it, most of it at 120 to 400 Hz, a little
     * clatter to 2 kHz. A six firing 70 times a second at idle fires six times a revolution,
     * as a two-stroke six does (~700 rpm): `cylinders` 12 in this four-stroke reckoning
     * (45 Hz at the tug diesel's 450 rpm idle, 100 Hz flat out; a four-stroke six at its revs
     * fired only 22 times a second at idle, heard as one cylinder thumping). Even cylinders;
     * short pulses; a narrow exhaust resonance at 210 Hz (`stack`) and a dip at 70 (`body`,
     * negative gain); the clatter riding on each firing (`grit`, `mech`). Rendered offline at
     * the recording's 70 firings a second and its size, its harmonics lay within 1 dB of the
     * recording's for the first three, its spectrum within a few per cent from 200 Hz up;
     * then all of it scaled to the tug diesel's size (below).
     */
    bigSix: {
      cylinders: 12,
      strength: [1.0, 0.98, 1.0, 0.98, 1.0, 0.98],
      jitter: 0.03,
      grit: 0.3,
      mech: 3.5,
      // Scaled from the recording's smaller six (owner: "a smaller straight 6 so you can adapt
      // for the size of the tug's one"): the tug diesel's block 2.65 m long against ~1.5 m,
      // ~35 litres against ~6.5 (cube root 1.75): about 1.8 times the size. A bigger engine of
      // the same kind rings lower in proportion: its resonances, the clatter's band and the
      // tone's low-pass divided by 1.8, its pulses 1.8 times as long.
      mechBand: [220, 780] as readonly [number, number] | null,
      pulseTau: 0.011,
      pulseTauLow: 0.007,
      body: { freq: 39, q: 1.0, gain: -6 },
      stack: { freq: 117, q: 4, gain: 16 },
      lp: { base: 390, rpm: 170, load: 220 },
      // (Rendered offline: within about 2 dB of the engine's old sound overall, and a few dB
      // stronger where a headset plays, 100 to 400 Hz, where most of it now is.)
      thump: { base: 0.26, rpm: 0.26, load: 0.4 },
      drive: 1.5,
      hiss: { base: 0.003, load: 0.012 },
      turbo: { idleHz: 650, boostHz: 1700, gain: 0.007 } as { idleHz: number; boostHz: number; gain: number } | null,
    },
    /**
     * The petrol V8 outboards (owner, Oct 2026: "a great V8 petrol outboard sound", heard on
     * the Alaskan 38, "without the turbo part"): the V8's voice exactly, the turbo whine
     * left out. Revving to 5800 rpm (the outboards' rated speed: ENGINE voices take their
     * pulse rate from the engine's revs), its beat runs four times the diesel's: the
     * high, hard V8 howl of an outboard flat out.
     */
    outboardV8: {
      cylinders: 8,
      strength: [1.0, 0.94, 0.58, 0.55, 0.6, 1.03, 0.97, 0.56],
      jitter: 0.12,
      grit: 0.08,
      mech: 0,
      mechBand: null as readonly [number, number] | null,
      pulseTau: 0.011,
      pulseTauLow: 0.005,
      body: { freq: 85, q: 0.9, gain: 5 },
      stack: { freq: 132, q: 2.0, gain: 3 },
      lp: { base: 160, rpm: 140, load: 200 },
      thump: { base: 0.55, rpm: 0.3, load: 0.4 },
      drive: 1.4,
      hiss: { base: 0.002, load: 0.01 },
      turbo: null as { idleHz: number; boostHz: number; gain: number } | null,
    },
  },

  /**
   * The engine on small speakers (a phone's, earbuds; on with the touch controls): their
   * speakers can't play the beat's fundamental (30-120 Hz), so its harmonics they can play
   * are lifted (`presenceDb` at `presenceHz`) and the tone opened up (`lpLiftHz` on its
   * low-pass); the ear hears the deep beat from them. VR and desktop are untouched.
   */
  /** Twin engines (the Shipyard's): the engine sound's level times this (two sources, ~+3 dB; split between the two engines' sounds). */
  engineTwinLevel: 1.4,
  /**
   * Twin engines' drone (owner): each engine has its own sound, and the second runs a little
   * off the first's revs, by a share of them that wanders slowly through zero: `share` at
   * most (0.8 %: 12 rpm at 1500, so their beats drift in and out of step about once every
   * 1-2 s at full revs, slower at idle), as the sum of two slow swings (`periodsS`, s,
   * weighted 0.6 / 0.4) so it never quite repeats. In real twins the governors never hold
   * exactly the same speed: the firing pulses go in and out of phase and you hear the
   * "wow-wow" drone. Only the sound: the physics still runs them in lockstep.
   */
  engineTwinDrift: { share: 0.008, periodsS: [23, 9.7] as [number, number] },

  engineSmallSpeakers: { presenceHz: 240, presenceDb: 9, lpLiftHz: 160 },

  /**
   * Multiplayer. "Try her together" (the Shipyard, owner Oct 2026): everyone in a design
   * session is sent into the game at once, and the crew may arrive before the one who pressed
   * it has the game open. So a crew-mate who finds no game yet tries again every
   * `togetherRetryS` seconds, up to `togetherTries` times (~40 s in all, a slow phone included).
   * The host changing boat (App `restartPage`): the host's page waits `restartLeadS` s after
   * telling the crew before it starts again (the notice on its way), each crew page
   * `restartFollowS` s before it starts again in her (the host's old room closed by then),
   * then joins as "sent in together" (the retries above, while the host's new page opens).
   * An attempt not in after `togetherConnectS` seconds is dropped and tried again (one
   * can hang if made just as the host's game opens).
   * `togetherLeadS`: the Shipyard waits this long after telling the others before going into
   * the game itself, so the message is out before its page closes.
   * Hosting that fails at the broker (slow, down, or a room still held by a page that closed
   * without saying) is tried again `hostTries` times in all, `hostRetryS` apart.
   */
  net: { togetherRetryS: 2, togetherTries: 20, togetherConnectS: 8, togetherLeadS: 0.6, hostTries: 4, hostRetryS: 3, restartLeadS: 0.8, restartFollowS: 1.5 },

  /**
   * Voice between the crew (net/voice.ts; owner request: up to four players). Everyone's
   * microphone goes to everyone else over the multiplayer link; how each voice is heard is
   * worked out from where the players are:
   *
   *   proximity (always on)  heard from where their head is, full up to `nearFull` metres,
   *                          fading to nothing at `nearMax` (a voice on deck, not over the sea)
   *   VHF (one channel)      while they press to talk on their handheld, heard by everyone
   *                          within `radioRange` metres through the radio: no direction, cut
   *                          down to the radio's narrow band (`radioLowHz`..`radioHighHz`) and
   *                          a little overdriven (`radioDrive`). Line of sight is not modelled:
   *                          a handheld's few kilometres, hills or not. Past `staticFrom` of
   *                          the range a hiss comes up, to `staticMax` at the edge. A radio
   *                          that's transmitting hears nobody (one talks at a time, as on VHF).
   *   squelchS / squelchGain the short burst of noise as a transmission starts and ends.
   *   retryS                 a call that failed is tried again after this (s).
   */
  voice: {
    nearFull: 2,
    nearMax: 22,
    radioRange: 5000,
    radioLowHz: 350,
    radioHighHz: 2800,
    radioDrive: 3,
    radioGain: 0.9,
    staticFrom: 0.6,
    staticMax: 0.08,
    squelchS: 0.12,
    squelchGain: 0.25,
    retryS: 5,
    /** Your own handset's talk button (audio/handsetAudio.ts): the switch's click and the squelch burst after it. */
    handset: { clickHz: 2200, clickGain: 0.5, squelchS: 0.09, squelchGain: 0.18 },
  },

  /**
   * The handheld VHF everyone carries with voice chat on (player/radioHandset.ts). VR: clipped
   * high on your left shoulder at `shoulder` (metres from your head: right, up, forward, turned
   * with your heading), up out of the way of hands pulling and grabbing (on the chest it was
   * taken by mistake); grip it within `grabRange` (m) to take it, hold the trigger to talk,
   * let go and it clips back on. `onAvatar`: where others see it, in the torso's axes (hung
   * from the neck). Desktop: hold V to talk.
   */
  radio: {
    shoulder: [-0.19, -0.2, -0.04] as [number, number, number],
    grabRange: 0.1,
    onAvatar: [-0.16, -0.06, -0.1] as [number, number, number],
  },

  /**
   * VR fly (Debug menu, for looking round the world in the headset): the left stick flies
   * the way you look (forward and back, side to side) at `speed` m/s; one trigger held
   * flies `fast` times quicker, both triggers `veryFast` times. The right stick still turns.
   */
  vrFly: { speed: 5, fast: 5, veryFast: 25 },

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

  /**
   * Regions (world/regions/, docs/REGIONS.md): several map areas, each drawn in full only
   * while you're near it. All regions' DATA is always live (terrain, harbours, charts, jobs);
   * what's streamed per player is the drawing.
   *   loadDistance    a region's full terrain, structures and trees are shown (built in a
   *                   worker the first time) when the viewer is within this of its footprint (m)
   *   unloadDistance  ...and put away again beyond this (m; wider than loadDistance so a
   *                   boat working along the edge doesn't flicker it in and out)
   *   residencyEvery  how often the distances are checked (s)
   *   sight           how far off a thing of height h (m) can be seen on the clearest day
   *                   (m): base + perSqrtHeight * sqrt(h). The owner's rule of thumb: a 100 m
   *                   hill from ~40 km, a 10 m light from ~12 km, the sea itself from ~5 km.
   *                   Not horizon maths: a cull distance, cut further by the day's visibility.
   *   lightVisFactor  a light (a point) is seen through haze a little further than land:
   *                   out to this times the visibility
   */
  regions: {
    loadDistance: 2500,
    unloadDistance: 3500,
    residencyEvery: 0.5,
    sight: { base: 5000, perSqrtHeight: 3500 },
    lightVisFactor: 1.3,
    /** Far-off land is nudged toward the camera by this many depth units (silhouettes; see render.far). */
    silhouetteDepthUnits: -4,
    /** A waterfall's ribbon stands this far off the rock, toward the water (m): the drawn walls are coarse. */
    fallStandOff: 4,
    /** A `mast` landmark's radio mast stands this tall on its summit (m); its light is at the top. */
    mastHeight: 40,
    /**
     * Coast regions (real coastline from tools/coast; world/view/coastView.ts): a 2 km chunk of
     * the ground is drawn in full within coastFineDistance of the viewer (m); farther ones are a
     * coarse copy sampled every coastCoarseCell m, reaching coastCoarseOverlap m into their
     * neighbours and coastCoarseDrop m lower (so no gap shows where near meets far); the region
     * seen from far off is sampled every coastSilhouetteCell m. Its buildings, many of them,
     * are drawn plain (no door or window), merged per chunk, only within coastBuildingDistance (m).
     * Oban, all far: 22k triangles at 90 m (48k at 60 m); its silhouette ~7k at 150 m.
     */
    coastFineDistance: 1000,
    /** ...coarse out to coastMidDistance (m), and beyond that every coastFarCell m (a big region's far hills). */
    coastMidDistance: 6000,
    coastFarCell: 270,
    coastCoarseCell: 90,
    coastCoarseOverlap: 90,
    coastCoarseDrop: 1,
    coastSilhouetteCell: 150,
    coastBuildingDistance: 2000,
    /**
     * A chunked coast region (a big Voyage map, the Clyde; world/coastStream.ts): a chunk's
     * detailed ground is fetched when the viewer or any boat comes within coastLoadDistance (m)
     * of its square, and dropped (memory back) beyond coastUnloadDistance; at most
     * coastLoadsAtOnce downloads at a time. Elsewhere the ground is the map's coarse grid.
     */
    /** A coast region's harbour kit (piers, quays, slipways, lamps) in squares this big (m), each drawn only within coastStructureDistance (m) of the viewer; lighthouses always. */
    coastStructureCell: 1000,
    coastStructureDistance: 2500,
    coastLoadDistance: 1500,
    coastUnloadDistance: 2600,
    coastLoadsAtOnce: 4,
  },

  /**
   * Tidal races as current zones (world/currents.ts; the zones are each region's `currents`).
   *   edgeFade     the current (and the standing waves) come up over this far inside a zone's edges (m)
   *   slackBelowKn the race counts as slack while it runs slower than this (the forecast, the chart)
   *   knock        the whirl points: a boat within `radius` m of one takes a yaw and a heel
   *                push, `yaw` and `roll` rad/s^2 at the point's middle at peak, scaled by the
   *                race's strength; each point turns its own way, and wanders with time so no
   *                two passes are alike. Never a capsize: the hull's own damping takes it.
   *   roar         heard from `hearRange` m outside a running race, `gain` at full strength inside
   */
  currents: {
    edgeFade: 60,
    slackBelowKn: 1.5,
    knock: { radius: 28, yaw: 0.07, roll: 0.08 },
    roar: { hearRange: 700, gain: 0.55 },
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
