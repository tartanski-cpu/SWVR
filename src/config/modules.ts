/**
 * The modules' settings (CONFIG.modules): each fitted part of a boat that the Shipyard and the recipes place.
 *
 * Part of CONFIG (src/config.ts joins every area's file into it): read it as CONFIG.<key>,
 * as ever. Units are SI unless the name says otherwise.
 */

export const MODULES_CONFIG = {
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
  /**
   * An offshore wind farm's turbines (world/windFarm.ts, world/view/windFarmView.ts; owner,
   * Oct 2026: crew transfer to wind farms). Our own design, sized as a modest older offshore
   * turbine, all heights from the mean sea level (m):
   *   pile      the monopile, `radius`, drawn from `from` (just under the water, where you'd see it) up
   *   tp        the yellow transition piece over it, `radius`, from `from` up to the platform
   *   platform  the deck round it at `y`, `radius` out, `thickness`, with a rail `rail` high
   *   tower     tapering from `base` to `top` radius, up to the hub
   *   hub       the rotor's centre's height; `blade` each blade's length; `nacelle` its box
   *   landing   the boat landing, on the face out along the turbine's landingDeg: two upright
   *             tubes `tube` in radius, their centres `halfSpacing` either side of the middle and
   *             `out` m out from the transition piece, from `bottom` to `top`; a ladder between
   *             them, rungs `rung` apart, on up the transition piece to the platform
   *   rotor     turning from `cutIn` m/s of wind, `rpm` at `rated`, stopped (feathered) over `cutOut`
   *   lights    red on the nacelle after dark, flashing every `flash` s (as the coast maps'
   *             turbines); a yellow light on each platform (the marking of an offshore structure)
   */
  /**
   * The TV (furniture kind 'tv'; modules/furniture/tv*.ts; owner, Oct 2026: "streaming of another browser
   * tab into the TV screen. So only for desktop users, but the screen should be visible for
   * all users"). A player on a desktop clicks a TV and picks a browser tab to show; the tab's
   * picture (and its sound, if they tick "share tab audio") goes to every crew-mate over the
   * game's own peer-to-peer link, as voice chat does (no server in between).
   *   capture     what's asked of the browser: at most `width` x `height` pixels at `fps`
   *               frames a second (a smaller picture costs the Quest less to decode and draw,
   *               and the caster less upload: one copy goes to each crew-mate).
   *   showWithin  m: the picture is drawn only from this near (farther, the screen is dark,
   *               and the Quest uploads no video frames).
   *   sound       its sound from the TV, in 3D (on the FM radio's volume slider): `gain`
   *               (0..1), full within `nearFull` m, fading to nothing at `nearMax` m.
   *   confirmS    s: started showing a tab, we wait this long for the world to say so before
   *               taking it that someone else has the TV (it's theirs then: ours stops).
   *   retryS      s: a call to a crew-mate that failed is tried again after this.
   */
  tv: {
    capture: { width: 1280, height: 720, fps: 30 },
    showWithin: 40,
    sound: { gain: 0.8, nearFull: 2, nearMax: 14 },
    confirmS: 3,
    retryS: 5,
  },

  /**
   * Crew transfer to the wind farm (transfer/transfer.ts; owner, Oct 2026). A job is called
   * `firstAfter` s into the game, then every `every` s (a range) once the last is done: `techs`
   * technicians (a range) for one turbine, waiting on the quay at `pickupPort`, at `pickup`
   * (world x, z; the first, the others `spacing` m along the quay, facing `yawDeg`). A boat
   * made fast in that port takes them aboard, one every `boardEvery` s. On a landing: her bow
   * within `reach` m of its face (and `across` m beyond its tubes either side), moving under
   * `maxSpeed` m/s, pushing at least `minPush` N; held `hold` s, the first steps across, then
   * one every `perTech` s more. Each takes `cross` s to step over, and climbs at `climb` m/s.
   */
  transfer: {
    firstAfter: 240,
    every: [420, 780] as [number, number],
    techs: [2, 3] as [number, number],
    pickupPort: 'calder',
    pickup: { x: 715.5, z: 640, spacing: 1.2, yawDeg: -90 },
    boardEvery: 1.5,
    landing: { reach: 0.9, across: 0.6, maxSpeed: 0.4, minPush: 2500, hold: 3, perTech: 2.5 },
    cross: 1.5,
    climb: 0.6,
  },

  windFarm: {
    pile: { radius: 2.5, from: -6 },
    tp: { radius: 2.7, from: -1 },
    platform: { y: 13, radius: 5.5, thickness: 0.4, rail: 1.1 },
    tower: { base: 2.1, top: 1.3 },
    hub: 72,
    blade: 42,
    nacelle: { length: 10, width: 3.6, height: 3.8 },
    landing: { out: 1.4, tube: 0.22, halfSpacing: 0.55, bottom: -3, top: 5, rung: 0.3 },
    rotor: { cutIn: 3, rated: 12, cutOut: 25, rpm: 14 },
    lights: { flash: 2, size: 1.4 },
    colors: { pile: 0x3c4246, tp: 0xe8c020, grey: 0x8c9094, tower: 0xeef0f0 },
  },

  modules: {
    /**
     * Drawing moving gear smoothly between simulation ticks (mechanisms/tickSmoother.ts; owner,
     * Oct 2026: the deck crane's slew stepped on the Quest). Each value follows the newest
     * tick through two smoothing stages, each with a time constant `tauTicks` times the time
     * between ticks: more smooths the 60-on-90 Hz staircase better but draws further behind
     * (about 2 x tauTicks ticks: 1.0 is ~33 ms on the Quest).
     */
    smoothing: { tauTicks: 1.0 },
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
     * control.twin-throttle (modules/twinThrottle; owner, Oct 2026): a lever for each engine of
     * a twin worked separately (each as throttleLever above), `spacing` apart (m), and between
     * their knobs a bright `grip` (`radius`, m; `colour`) that works both as one.
     */
    twinThrottle: { spacing: 0.16, grip: { radius: 0.019, colour: 0xffc21a } },

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
        // (Strips light enough for their dark titles to read: owner, Oct 2026, "not very clear".)
        { title: 'SEARCH · FIRE', x: [-0.89, -0.38] as [number, number], color: 0xe0664a },
        { title: 'DECK', x: [0.19, 0.72] as [number, number], color: 0x2f6fd0 },
        { title: 'ENGINE', x: [0.74, 1.32] as [number, number], color: 0x5cc46c },
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
        // (On the console body's step in front of the dash's foot, 0.12 m up: at -0.28 on the panel their names lay over the groups' title strips, owner, Oct 2026.)
        lamps: { position: [0.95, 0.121, -0.315] },
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
     * Trawl deck gear (owner, Oct 2026: step 2 toward a trawler; modules/netDrum, modules/trawlWinches).
     * deck.net-drum: the net wound on a hydraulic drum on the centreline forward of the
     * A-frame, its axle across her `axleHeight` over the deck on two stands; flanges `flange`
     * in radius, the core `core`, `length` between the flanges; the net on it as a packed roll
     * up to `fullRadius` when it's all aboard. It turns as the net comes off or on
     * (`turnsPerNet` turns from full to empty). Its hydraulic motor on the starboard stand.
     * deck.trawl-winches: a split pair, one each side at the deck edge forward of the A-frame's
     * feet, each a drum of warp (`drumRadius`, `drumWidth`, flanges `flange`; full of warp to
     * `fullRadius`) on a base, its motor outboard; the warp leads aft to its block on the
     * A-frame; `turns` of the drum to pay the warp right out. Colours: drums and frames.
     */
    netDrum: { length: 1.3, flange: 0.5, core: 0.18, fullRadius: 0.44, axleHeight: 0.62, stand: 0.12, turnsPerNet: 5, colours: { frame: 0x2f6aa8, net: 0x2e5a3a, flange: 0x2f6aa8, motor: 0x30343a } },
    trawlWinches: { drumRadius: 0.12, drumWidth: 0.3, flange: 0.22, fullRadius: 0.2, axleHeight: 0.38, base: { width: 0.55, length: 0.5 }, turns: 30, colours: { frame: 0x2f6aa8, warp: 0x22262a, motor: 0x30343a } },

    /**
     * deck.dive-frame (modules/diveFrame; owner, Oct 2026: a dive support ship launching a
     * small submersible off her stern, for the submersible game): a heavy A-frame over the
     * transom (a launch and recovery system), an umbilical winch on its crosshead, a docking
     * head under it that grips the submersible's lift point, and her cradle on deck forward of it.
     *   legLength      the frame's legs, foot pin to crosshead (m)
     *   footFromTransom, footInset  where its feet are pinned: forward of the transom, in from her side (m)
     *   deckClear      the sub's tail this far forward of the transom on her cradle (m)
     *   overClear      swung out, her bow this far aft of the transom (m): clear to lower
     *   luffRateDeg    how fast the rams swing it (deg/s; about 20 s right across)
     *   wireRate       how fast the winch hoists and lowers (m/s)
     *   slack          how much more umbilical it pays out once she rests (on her cradle, or afloat) (m)
     *   dockTol        the wire out no more than this (m): she's in the docking head, and the frame may swing
     *   headDrop       the docking head below the crosshead (m)
     *   frameKg        the frame, rams, winch and head (her lightship; the sub is a payload)
     *   ram            the rams' deck lugs `forward` of the feet, pinned to the legs `at` of the way up
     *   stand          the control stand, by the starboard foot: `forward` of it and `inboard`, its top `height` over the deck
     *   cradle         her deck cradle's height (m)
     *   sub            the submersible (drawn as the submersible game draws her, src/sub/exterior.ts
     *                  there): `massKg` (a 10 t three-person work sub, as hers); her lift point
     *                  `lift` above her axis and `liftZ` aft along it; her skids' undersides
     *                  `bottom` below her axis; her bow `front` forward of the lift point and her
     *                  tail `aft` aft of it; `halfWidth` her widest (the thruster ducts); afloat,
     *                  her axis `floatAxis` under the water (her top fairing just out of it)
     *   dive           the DIVE button (modules/diveFrame/launch.ts): with the sub afloat, over a
     *                  wreck site (within CONFIG.dive.radius) and making under `maxSpeedKn`, it
     *                  opens the submersible game at `url` with her `sub` id and `tier` (3: the
     *                  three-seat work sub with her mini ROV), after `fadeS` s of fade
     */
    diveFrame: {
      legLength: 6.5,
      footFromTransom: 0.6,
      footInset: 0.25,
      deckClear: 0.3,
      overClear: 0.4,
      luffRateDeg: 4,
      wireRate: 0.35,
      slack: 1.5,
      dockTol: 0.02,
      headDrop: 0.45,
      frameKg: 6500,
      ram: { forward: 1.1, at: 0.38 },
      stand: { forward: 0.6, inboard: 0.55, height: 1.05 },
      cradle: { height: 0.35 },
      sub: { massKg: 10_000, lift: 1.6, liftZ: 0.5, bottom: 1.46, front: 3.5, aft: 3.9, halfWidth: 1.45, floatAxis: -0.9 },
      colours: { frame: 0xe8e8e2, head: 0x30343a, ram: 0xc8ccd0, cradle: 0x30343a, umbilical: 0xe0a020 },
      dive: { url: 'https://tartanski-cpu.github.io/Submersible-World/', maxSpeedKn: 0.5, sub: 'work3', tier: 3, fadeS: 1.2 },
    },

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
     * hull.tubes (modules/tubes): an inflatable's tubes (owner, Oct 2026: the tender as a
     * rubber dinghy; the fast rescue boat's too). Two tubes along her deck edges, joined in a
     * round nose over her bow and running on `aft` m past her transom to rounded ends. Each
     * tube's centre is on her deck edge, `inset` m in from it, so it overhangs her side by
     * radius - inset and its top is `radius` above her deck (her layout's bulwarkHeight, her
     * gunwale). Looks only: merged with her fixed parts, no draw call of its own.
     *   radius      the tube's (m): about 0.2 on a 3 m dinghy, 0.25 on a 6 m RIB
     *   segments    along the tubes, and round each (few: it's small and seen from close)
     *   colour      the fabric's
     */
    tubes: {
      dinghy: { radius: 0.2, inset: 0.12, aft: 0.25, segments: 40, round: 8, colour: 0x5b6168 },
      /** The rescue boat's: bigger, longer past her transom, rescue orange. */
      rib: { radius: 0.26, inset: 0.14, aft: 0.35, segments: 56, round: 8, colour: 0xe2601e },
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
    /**
     * hull.bow-fender (modules/bowFender; owner, Oct 2026: crew transfer to wind farms): a
     * crew-transfer boat's bow fender, a block of black rubber round the top of her stem (or
     * across the front of a catamaran's bridge deck), its plumb front `thickness` m forward of
     * her stem at the deck, `width` m across (`catWidth` on a catamaran), from `above` m over
     * her deck (her bulwark top) down `depth` m (not below her bridge deck's underside on a
     * catamaran, nor `clear` over her DWL), its front corners chamfered by `chamfer`. It weighs
     * `kgPerM3` a cubic metre of its outline (a moulded fender, its rubber round a hollow core: on
     * the catamaran about a quarter of a tonne), and is probed on its face at
     * `across` x `up` points (it grips as the tug's push knees do: CONFIG.contacts.guards.pushFender).
     */
    bowFender: { thickness: 0.4, width: 0.9, catWidth: 1.8, depth: 1.2, clear: 0.4, chamfer: 0.1, kgPerM3: 250, across: 3, up: 3, color: 0x1b1c1e },

    hullGuard: {
      strake: { radius: 0.07, drop: 0.06, kgPerM: 5, spacing: 0.6 },
      tyres: { radius: 0.45, hole: 0.21, thickness: 0.28, drop: 0.4, spacing: 0.92, minBeam: 0.45, kgEach: 45, formFactorAdd: 0.03 },
    },

    /** instrument.warning-lamps: the lamps' spacing (m). Closer since TEMP and FUEL joined (CS5: nine lamps, 0.5 m, about the row's old length). */
    warningLamps: { spacing: 0.056 },

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
     * with two buttons, AUTO START and DOCK. `width`, `height` (m), `pitch` between the buttons,
     * `amps` with the master on (INSTRUMENTS circuit; it works only with it live). `gap`: how far
     * aft of the breaker panel it hangs (m, between their edges).
     * `autopilot` (vessel/autopilot.ts; the boat with the panel has one, its buttons on the
     * console: owner, Oct 2026, "a separate control that goes on the main console"): it steers to
     * hold her heading as a helmsman would, the wheel turned in proportion to how far she is off
     * her heading (`helmPerDeg`, helm travel per degree off) less how fast she is already swinging
     * back (`helmPerDegS`, per degree a second: so she doesn't overshoot), never more than
     * `maxHelm` of the wheel's travel. Its PORT and STBD buttons move the heading it holds
     * `stepDeg` degrees a press ("two buttons which add 5 degrees left and right").
     */
    helmAssist: { width: 0.22, height: 0.14, pitch: 0.085, amps: 0.6, gap: 0.04, autopilot: { helmPerDeg: 0.04, helmPerDegS: 0.25, maxHelm: 0.5, stepDeg: 5 } },

    /** radio.vhf (M3c): the VHF set hung from the roof; how far its face tilts down toward you; its draw (A, RADIO circuit). */
    vhf: { tiltDeg: 35, amps: 1.5 },

    /** nav.chartplotter (M3c): the chartplotter hung from the roof; its screen's tilt; its draw (A, CHART circuit). */
    chartplotter: { tiltDeg: 35, amps: 2.0 },

    /**
     * furniture.piece (parametric boats P5; owner): a Shipyard boat's furniture, each piece on a
     * floor with its back to a wall (the seat stands free, facing forward). Its socket is the
     * middle of its foot on the floor; in its own axes x runs along the wall and +z toward the
     * wall (its back), so you face it from -z. For each kind its length along the wall and depth
     * out from it (m), its weight (kg), and:
     *   berth   a bunk: its platform `top` high, a `cushion` on it;
     *   settee  its seat `seat` high, its back `back` high against the wall;
     *   galley  a counter `top` high, a sink and a two-burner stove let into its top;
     *   seat    a helm or companion seat on a pedestal, its seat `seat` high, its back `back`;
     *   locker  a cupboard to the ceiling;
     *   head    a compartment to the ceiling, its walls `wall` thick, a toilet inside, a hinged
     *           door `door` wide in the side facing the room (a press on it opens or shuts it).
     * A piece to the ceiling stops `ceilingGap` short of it. `colours`: the joinery, the worktop
     * and walls, the cushions, steel, porcelain, and the dark of a sink or a stove's top.
     */
    furniture: {
      berth: { length: 1.95, depth: 0.7, top: 0.45, cushion: 0.1, kg: 45 },
      settee: { length: 1.4, depth: 0.55, seat: 0.45, back: 0.85, kg: 35 },
      galley: { length: 1.3, depth: 0.6, top: 0.9, kg: 70 },
      seat: { length: 0.5, depth: 0.5, seat: 0.62, back: 1.05, kg: 20 },
      locker: { length: 0.6, depth: 0.55, kg: 30 },
      head: { length: 1.0, depth: 1.0, wall: 0.04, door: 0.6, kg: 60 },
      // Crew accommodation (owner, Oct 2026: "a little bit more interior accommodation,
      // including like a kitchen and sleeping quarters"): two-high bunks (the lower's base
      // `lower` high, the upper's `upper`, each with a `cushion`; a lee rail `rail` high along
      // the upper's open side; it wants `sitUp` of headroom over the upper cushion); a crew mess
      // (a table `table` high against the wall between two benches `bench` long, their seats at
      // `seat` and backs to `back`); a shower stall (a tray, three walls to the ceiling and a
      // curtain across its front, `wall` thick).
      bunk: { length: 1.95, depth: 0.75, lower: 0.3, upper: 1.1, cushion: 0.1, rail: 0.18, sitUp: 0.55, kg: 95 },
      mess: { length: 1.7, depth: 0.75, table: 0.74, bench: 0.45, seat: 0.45, back: 0.85, kg: 75 },
      shower: { length: 0.85, depth: 0.85, wall: 0.04, kg: 45 },
      // A flat-screen TV on a wall bracket (modules/furniture/tvScreen.ts): `length` wide (a 32-inch screen), its
      // case `depth` deep off the wall on the bracket, the screen `screenH` high with a `bezel`
      // round it, its middle `centre` m over the floor (eye height seated, over a settee; lower
      // under a low ceiling).
      tv: { length: 0.76, depth: 0.1, screenH: 0.4, bezel: 0.015, centre: 1.35, kg: 8 },
      ceilingGap: 0.05,
      colours: { tvCase: 0x16181b, tvOff: 0x0b0d10, joinery: 0xb08a5c, top: 0xdedbd2, cushion: 0x2b3a55, steel: 0x9aa0a6, porcelain: 0xf2f2ee, dark: 0x2a2d30, curtain: 0x7fa8c0 },
    },

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
        // In gear, dragged below this fraction of idle: she stalls (CONFIG.vessels.workboat.engine.stallFraction).
        stallFraction: 0.3,
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

    /**
     * Azimuth drives (owner, Oct 2026: the harbour tug's ASD drives and their controls; the
     * diesel's `azimuth`, modules/dieselInboard; the levers, modules/azimuthLevers). Each drive
     * a Z-drive under her stern that turns right round on its upright axis and pushes the way
     * it points (its propeller in a nozzle, pulling, forward of its leg).
     *   slewDegPerS     how fast each drive turns to follow its lever (deg/s; real ones, about
     *                   10 to 30 s for a full turn; tune by feel)
     *   legArea         each leg's side area (m^2): a little rudder in the water past it
     *   propFwd         the propeller this share of its diameter ahead of the leg, along its push
     *   transitMaxDeg   TRANSIT: the wheel hard over swings both drives this far (deg), as rudders
     *   driveRatio      the drive's own bevel gears (upper and lower), on top of her gearbox's
     *                   ratio: a Z-drive's whole reduction is about 5 to 7 to 1, so a big slow
     *                   propeller can take the engine's full power
     *   look            the drive as drawn: the leg's width across and chord (m), the housing's
     *                   radius as a share of the propeller's diameter, the nozzle's length (share)
     *                   and its wall's thickness (m)
     *   hullClear       the Shipyard hangs each drive low enough that the top of its nozzle clears
     *                   her bottom by this (m), all along and across the nozzle
     *   lever           each drive's twist-and-throttle lever (control.azimuth-lever): its length
     *                   to the grip (m), how far it tilts at full power (deg), the power below which
     *                   it reads idle (`detent`, 0..1), how far the turntable turns for a degree of
     *                   the hand's twist (`twistGain`: a wrist turns about 90 deg comfortably, so
     *                   a full turn round is a few grabs), its turntable's radius (m) and colours
     *   console         where the Shipyard puts them (control.azimuth-lever ×2, the helm console's
     *                   slots, from its centre): each lever `leverX` out from the wheel's middle
     *                   (either side) and `leverZ` aft of the console top's aft face, on its own
     *                   pedestal; TRANSIT on the starboard lever's pedestal ahead of it
     *                   (`transitZ`); the port pedestal joysticks (searchlight, fire monitor)
     *                   moved out `joystickShift` to port, clear; and the tug's wheel smaller,
     *                   `wheelRadius` (m), so the levers sit close in for both hands
     */
    azimuth: {
      slewDegPerS: 12,
      legArea: 1.6,
      propFwd: 0.4,
      transitMaxDeg: 35,
      driveRatio: 1.6,
      hullClear: 0.15,
      look: { legWidth: 0.24, legChord: 0.75, housing: 0.11, nozzleLength: 0.5, nozzleWall: 0.09, colour: 0x4a5560, nozzleColour: 0x30363c },
      lever: { length: 0.15, maxTiltDeg: 35, detent: 0.07, twistGain: 1.5, turntableRadius: 0.05, colours: { port: 0xd03a2a, stbd: 0x2a9a4a, rod: 0x9aa0a6, base: 0x23282c } },
      console: { leverX: 0.3, leverZ: 0.2, transitZ: -0.02, joystickShift: 0.2, wheelRadius: 0.13 },
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
};
