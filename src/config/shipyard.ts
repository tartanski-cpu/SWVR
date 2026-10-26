/**
 * The Shipyard's settings (CONFIG.shipyard): its choices, parts, prices and checks.
 *
 * Part of CONFIG (src/config.ts joins every area's file into it): read it as CONFIG.<key>,
 * as ever. Units are SI unless the name says otherwise.
 */

export const SHIPYARD_CONFIG = {
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
     * The least stability (GM, m) she's let into the game with (review, 24 Oct 2026: slim,
     * deep designs with GM below 0 turned turtle at the berth seconds after Play). Below it
     * the Shipyard says she'd capsize and holds back Try her (page.ts); 0.15 m leaves a
     * margin over upright for the game's sea and her crew moving about. Low stability (under
     * `lowGM`) is still only a warning.
     */
    minGM: 0.15,
    lowGM: 0.5,
    /**
     * The most power a displacement hull (the tug, the trawler) takes, kW per tonne of her
     * lines' displacement (owner, Oct 2026: two 750 kW engines don't fit a small tug). Her
     * speed is held by her length, not her power, so past this the power is spent making
     * waves and turning a propeller too small for it; working tugs and trawlers carry about
     * 8 to 18 kW a tonne. Twin engines past it go in singly (if one is within it).
     */
    maxKwPerTonne: 20,
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
      gear: { towWinch: 450, aFrame: 350, sternRoller: 60, skiff: 500, rescueBoat: 2_100, anchor: 150, rodRack: 12, netDrum: 380, trawlWinches: 520 },
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
    /**
     * The front windows on a wide wheelhouse (owner, Oct 2026, from a photo of a big trawler's
     * wheelhouse: "as you stretch, the windows should multiply"). A flat front keeps the usual
     * three panes (the middle one 1 m, mullions at +-0.5 m) while its outer panes are no wider
     * than `paneMax` (m); wider, it's split into an odd number of equal panes (a pane, not a
     * mullion, in front of the helm), each no wider than `paneMax`, at most `maxPanes`. A
     * three-facet front: the angled side facets `sideFacet` m across (in plan; owner: "the side
     * facets should be shorter") once the house is wide enough, the middle facet the rest,
     * split into panes the same way (never narrower than the usual 1 m middle pane).
     */
    frontWindows: { paneMax: 1.1, maxPanes: 7, sideFacet: 0.75 },
    /**
     * More sheer (owner, Oct 2026: "this bow has got quite a lot of sheer. The default one is
     * quite flat"; Shipyard, Hull step, Sheer; build.ts withSheer): her deck line raised up to
     * 1.2 m more at the stem (in 0.15 m steps, design.ts SCALES.sheer), nothing aft of `from`
     * (a share of her length from the transom), rising as the square of the distance forward.
     */
    sheer: { from: 0.4 },
    /**
     * A straight stem (owner, Oct 2026: "a plumb bow should be straight down, then a nice
     * radius at the bottom"; catalog.ts bowKeel): a stem raked up to `straightUpTo` deg (the
     * plumb and the first step) is a straight line down from her stem head, rounded into her
     * keel by a forefoot radius of `forefootRadius` x her stem's height (keel to stem head).
     * A station at its foot and `radiusStations` between its ends, so it reads as a rounded
     * forefoot, not a corner; few, as it's under water (owner: no need for a fine radius there).
     * Each station is about 85 more triangles on her hull and a little more work for her
     * physics. A more raked stem is curved all the way down (full forward, as before).
     */
    bow: { straightUpTo: 12.5, forefootRadius: 0.3, radiusStations: 1 },
    /**
     * A raised foredeck (owner, Oct 2026, from a photo of a trawler; the fishing boat's;
     * shipyard/parts/house.ts raisedForedeck): her deck stepped up forward of a break, a
     * vertical bulkhead across her, her sides and bulwarks stepping up with it. Reached as on a
     * trawler or tug: a steep ship's ladder each side against the break, beside the bulwark
     * (`fromSide` in from her deck edge, `width` wide), the middle of the working deck clear;
     * each rise at most `stepRise` (you walk up them: layout.ts STEP_HEIGHT is 0.4), treads
     * `tread` deep (about 55 degrees), a handrail on the inboard side `rail` high, `clear` of
     * deck kept at their foot. Run on aft under the wheelhouse, it ends at least `landing` m
     * aft of the house's aft wall (more for a raised cabin floor's door steps). Deck gear
     * (shipyard/parts/deckGear.ts) stands wholly on one deck or the other (its plan shape, which
     * has a margin of about 10 cm round it, reaching at most `gearReach` m past the break), and
     * off the ladders; the foredeck's crane and skiff go up on the raised deck
     * when it has room (owner, Oct 2026: they were on the deck below it).
     */
    /**
     * The handles on the 3D view (page.ts; owner, Oct 2026: "different colors of drag handles
     * ... so you can see which ones you're dragging"): each its own colour, by the design
     * choice it drags, with a dot of it beside its slider; `fallback` for one not listed.
     * Pointed at or held, a handle grows and lightens `hotLift` of the way to white (it keeps
     * its colour).
     */
    handles: {
      colours: { length: '#f97316', bow: '#e879f9', beam: '#22d3ee', depth: '#a3e635', bulwark: '#8b7cf6', sheer: '#fde047', fcLength: '#ef4444', fcHeight: '#f5f5f5' } as Record<string, string>,
      fallback: '#6aa8e6',
      hotLift: 0.4,
    },
    foredeck: { stepRise: 0.3, tread: 0.2, clear: 0.3, width: 0.6, fromSide: 0.3, rail: 0.9, landing: 0.6, gearReach: 0.08 },
    /**
     * A hull that shrinks below its base size (catalog.ts `shrinksTo`; owner, Oct 2026: "a
     * really tiny tug"): her beam and her depth shrink with her length, each to its power (a
     * length factor of 0.54 takes her beam to 0.67 and her depth to 0.63: a small tug is
     * relatively beamier and deeper than a big one, for her stability and her engine). Her
     * ballast scales with her hull's volume (length × beam × depth factors) for every hull
     * that carries it.
     */
    shrink: { beam: 0.65, depth: 0.75 },
    /** A wheelhouse offset across her (design.houseX): its outer wall kept this far (m) inside her deck edge, clear of her bulwark. */
    offsetEdge: 0.08,
    /** Windows raked out all round (owner: a tug's or supply vessel's bridge): the side and aft windows lean out this far from vertical (deg), from their sill up to the roof. */
    flareDeg: 15,
    /** The roof's visor: how far it reaches forward of the top of the front windows (m), overlapping them. One set length now (owner: no slider for it; it was 0.15 to 0.75). */
    visor: 0.3,
    /**
     * The window sills, one height all round (owner), above the wheelhouse floor (m):
     * `standard` (the dash top stands above it at the front), or `low`, below the console's
     * desk (0.9 m), with the console's upright panel taken off and its screens on stalks so
     * you see down past them (owner), or `high` (owner, Oct 2026: "a third option ... to have
     * them higher ... standing up, you should be able to see through the windows"): level with
     * the dash top (0.9 + 0.41 m), chest height, as a heavy-weather trawler's or tug's; a
     * standing helmsman's eyes (about 1.6 m) are still well up in the glass.
     */
    windowSills: { standard: 1.0, low: 0.75, high: 1.3 },
    /**
     * Her hull's finish (owner, Oct 2026: "pre-configure a boat to look used or new";
     * design.finish): how much the weathering tile shows on her topsides (render/pixelPaint.ts
     * `topsides`: waterline grime, rust runs from the deck edge, faded paint), 0 plain paint ..
     * 1 the tile as drawn. In the design's order: well used first (0, as every boat looked
     * before the choice), then worked, then as new.
     */
    finish: [1, 0.5, 0],
    /**
     * The harbour tug (owner, Oct 2026; DESIGN_HULLS 'Harbour tug'): her plating and framing
     * heavier than the usual steel by `scantlings` (built heavy, for pushing ships), and her
     * `ballastKg`, so she floats near her lines' 3.3 m draught: a real tug's 494 t is far more
     * than the build counts (her heavy framing, machinery, tanks of water and stores), carried
     * here as one weight `ballastAboveKeel` m above her keel, where it gives her a real tug's
     * stability (GM about 2 m on her KM of 5.8 m), not all down in her bilge. Her fuel tanks
     * `fuelL` litres, a ship's (about 60 m³), not the small boats' litre a kW. Her engines (on
     * the Z-drives she's drawn with) level and low, their gearbox ends `zDriveEngineAft` of her
     * length forward of her transom (owner, Oct 2026: "much lower and further back"). Her propellers reach `propDepth` m below her waterline, as her
     * drive pods would hang under her shallow stern (her real pods reach 5.3 m), until the
     * drives come: her stand-in shafts turn propellers of a tug's size, not her transom's.
     */
    // Her fendering (parts/fendering.ts): `fenderingKg` of rubber (belts, stern and bow
    // cylinders, the bow's blocks: about 6 t on a 25 m tug); its contact points one to each
    // `probeCell` m cell of its outer face.
    harbourTug: { zDriveEngineAft: 0.29, scantlings: 1.6, ballastKg: 315000, ballastAboveKeel: 3.9, fuelL: 60000, propDepth: 3.0, fenderingKg: 6000, probeCell: 0.9,
      /**
       * Her gearbox step (design.gear, 0..15), fixed (owner, 26 Oct 2026: "a fixed engine
       * configuration and a fixed propulsion, so there shouldn't be any resolving of the
       * gearbox"): the step the yard's trial matched for her twin 1850 kW and azimuth drives
       * (about 12 kn flat out, the engines at their rated revs). Never matched again by the page.
       */
      gear: 14 },
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
     * The switch panel (dynamic console sockets CS2; shipyard/parts/consoleGrid.ts packPanel):
     * a row of switch cells `switchPitch` (m) apart along the console; each group of switches a
     * run of them under its coloured plate (inset `plateInset` m at each end), the horn alone
     * `wheelClear` m port of the wheel's middle (under its rim, beside the hub), the groups no
     * nearer the wheel's middle than `groupClear` m (behind its rim a switch is hard to see and
     * reach: the rim is 0.22 m, but the panel lies further from the eye than the wheel, so seen
     * from the helm the rim covers about 1.4 times that, and a switch's half width more);
     * closer together if there isn't room, but never under `minPitch` m apart (then the
     * nearest group to the wheel reaches in under it). On a console too short for that, the
     * groups use the panel in front of the wheel too (owner, Oct 2026: on a narrow console
     * "those buttons ... could be placed on the empty part of the console in front of the
     * wheel"): each side's groups up to `centreClear` m from the middle, the horn with the
     * port side's; only what still doesn't fit goes up onto the dash face (faceSwitchOrder).
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
    exhaustStack: {
      radius: 0.14, inset: 0.05, below: 0.5, aboveRoof: 1.9, waterAbove: 0.3, rakedShare: 0.3, rakeDeg: 25, cutDeg: 35, taper: 0.88, colour: 0x7a5236, casing: 0xd8d6d0,
      /**
       * Stacks standing on the deckhouse (design.stackMount; owner, Oct 2026: "the exhaust pipes in
       * a kind of standalone box", round or square): each in a casing `casingHeight` m tall over
       * the deckhouse top, `casingPad` m round its pipe, its outer face `fromSide` m in from the
       * deckhouse's side, its ends kept `endClear` m in from the deckhouse's ends; the pipe
       * standing `aboveCasing` m over the casing's top.
       */
      onDeckhouse: { casingHeight: 1.6, casingPad: 0.3, fromSide: 0.15, endClear: 0.15, aboveCasing: 1.4 },
    },
    /** Old school instruments (design.oldSchool): the analogue gauges' price (GBP; the basic screens are 6,000, the advanced 18,000). */
    oldSchoolPrice: 4000,
    /** What each advanced touchscreen adds to her price (GBP; CS5: a big multifunction display, on top of the advanced package). */
    touchPrice: 2500,
    /** helm.screenLift: the dash screens and gauges raised this far up the (leaning) dash face (m), so the lower row's foot clears the ledge in front of it. */
    /** helm.minInside: the narrowest wheelhouse, inside (m; CS6: one at a short console). helm.faceSwitchOrder: on a console too short for its switch panel, the groups moved up onto the dash face, in this order, until the rest fit. */
    /** helm.lampsUpBelow: on a console shorter than this (m; the shortest before CS6), the warning lamps' row goes up onto the dash face, clear of the wheel's rim. */
    helm: { maxConsole: 2.2, minInside: 1.2, lampsUpBelow: 1.58, faceSwitchOrder: ['DECK', 'AUTOPILOT', 'SEARCH', 'LIGHTS', 'ENGINE'] as string[], screenLift: 0.03, screenGap: 0.02, hungReach: 1.0, switchPitch: 0.14, minPitch: 0.1, plateInset: 0.02, wheelClear: 0.11, groupClear: 0.36, centreClear: 0.03, podJoystick: { throttleZ: 0.0, stickZ: 0.225, button: [0.085, -0.08] as [number, number] } },
    /**
     * The advanced interior's working lights (owner): the overhead switch panel (panel.overhead)
     * and the foredeck and aft deck floodlights (light.flood). No rail lights for now (owner).
     *   overheadAft   the panel's face this far aft of the wheelhouse front (m), on the
     *                 centreline, just aft of the hung NAV / WIND screen and over the helm;
     *   flood.x       each flood this far to port of the centreline (m), clear of the
     *                 searchlight and the fire monitor at their usual centreline places;
     *   flood.out     each lamp's middle this far out beyond the roof's front or aft edge (m):
     *                 hung on the edge, as on a real wheelhouse (owner, Oct 2026: set in on
     *                 the roof, they lit the wheelhouse inside);
     *   flood.margin  each beam's edge this many degrees clear of the inside of the wheelhouse
     *                 wall at its end: the game's lights cast no shadows, so the wall and roof
     *                 don't stop a beam (shipyard/parts/places.ts floodAim); aimed at the middle
     *                 of its deck if that clears, else tilted outboard until it does;
     *   flood.minBelowDeg  tilted no flatter than this below the horizon (deg);
     *   flood.minAngleDeg  the beam narrowed, if need be, never under this (deg);
     *   flood.keepClear  the roof round each flood that hand-placed roof gear keeps off (m).
     */
    workLights: { overheadAft: 0.7, flood: { x: 0.35, out: 0.07, margin: 4, minBelowDeg: 15, minAngleDeg: 35, keepClear: 0.3 } },
    deckGear: {
      winchFromTransom: 0.75,
      standRoom: 0.6,
      /**
       * The trawl deck gear's places (owner, Oct 2026; both with the A-frame only): the net
       * drum on the centreline `netDrum.gap` forward of the A-frame's rams' feet, moved forward
       * in 10 cm steps until it stands clear (at most `netDrum.search` m); the trawl winches
       * at the deck edges, `trawlWinches.gap` forward of the rams' feet, `trawlWinches.edge` in
       * from it, moved forward the same way.
       */
      netDrum: { gap: 0.35, search: 2.5 },
      trawlWinches: { gap: 0.3, edge: 0.15, search: 2.5 },
      /**
       * A tug (the tug hull; owner, Oct 2026: "move the towline position to midships on the
       * tugs"; "tugs should always have the wheelhouse forward"). Her tow point is a towing
       * hook on a pedestal on the centreline near amidships, not the stern roller: a line
       * pulling off to one side then has a short lever arm about her pivot point (near her
       * middle), so she can still steer against it. From the transom roller the arm is half
       * her length, and an off-centre pull swings her stern round faster than her rudder can
       * hold her: girting, the tug hauled broadside by her own tow.
       *   houseAftOfMidships  her wheelhouse (and saloon) ends no further aft than this
       *                       fraction of her length aft of amidships: 0, amidships. Placed
       *                       by her Shipyard house position as any boat's, and stopped
       *                       there if it would lie further aft (a house that's forward
       *                       already stays where it is).
       *   hook.aftOfMidships  the hook this fraction of her length aft of amidships, near her
       *                       centre of gravity (the small tug's is 0.06 L aft), at least
       *                       `clearOfHouse` m aft of the wheelhouse;
       *   hook.height         its top this high over the deck (m), so the line clears the aft
       *                       bulwark on its way to the tow; `postRadius` its pedestal;
       *   hook.winchGap       her tow winch's usual place on a tug: this far forward of the
       *                       hook (m, drum to hook), the line off the drum aft through it.
       */
      /**
       * A tug that tows over her bow (the harbour tug): her towing staple `fromStem` m aft of
       * her stem, its roller `overBulwark` m over her bulwark there; her winch from `winchFromStem`
       * m aft of her stem (the first place it stands, facing forward).
       */
      bowStaple: { fromStem: 0.6, overBulwark: 0.15, winchFromStem: 3.0 },
      tug: { houseAftOfMidships: 0, hook: { aftOfMidships: 0.12, clearOfHouse: 0.6, height: 1.4, postRadius: 0.1, winchGap: 0.7 } },
      sideDoor: { width: 0.75, fromConsole: 0.35, buttonHeight: 1.1, sideDeck: 0.5 },
      ringFromCorner: 0.4,
      anchor: { fromStem: 0.35, fromSide: 0.45, kedgeAft: 0.4 },
      /**
       * With a skiff (owner): a pair of midship cleats for her painter, one on each bulwark top,
       * this far (m) off the house's end on the skiff's deck (the workboat's are just aft of
       * her wheelhouse), and at least `fromEnds` (m) inside the mooring cleats.
       */
      midCleats: { fromHouse: 0.4, fromEnds: 0.6 },
      price: { towWinch: 12_000, sternRoller: 2_000, aFrame: 18_000, lifeRing: 600, sideDoor: 3_000, anchor: 3_500, skiff: 38_000, rescueBoat: 78_000, rodRack: 700, netDrum: 16_000, trawlWinches: 22_000, diveFrame: 260_000 },
    },
    /**
     * The dive A-frame and its sub (design.diveFrame; parts/diveFrame.ts; modules/diveFrame):
     * what she must have for it (owner: "placeable on any boat that's big enough"). Its legs
     * `legClear` m clear of the sub each side; legs from the module's `legLength` up to `maxLeg`
     * m if her bulwark needs them, the sub's skids `bulwarkClear` m over the transom's bulwark
     * as she swings out; the sub no more than `maxShare` of her weight, and her GM at least
     * `minGM` m with the sub hanging at the docking head; with her hung out over the stern, at least `minFreeboard` m of
     * freeboard left at the transom (her sinkage and trim from her own waterplane). Its price
     * (deckGear.price.diveFrame) is the frame and the sub together.
     */
    diveFrame: { legClear: 0.15, maxLeg: 9, bulwarkClear: 0.15, minFreeboard: 0.3, maxShare: 0.2, minGM: 0.5 },
    /**
     * The deckhouse a design can have under her wheelhouse (shipyard/build.ts): its walls and
     * top weigh `kgPerM2` (welded aluminium plate and stiffening) and cost `pricePerM2`
     * (GBP); it stops `fromStem` m short of her stem (the narrow bow) and `edge` m inside her
     * deck edge (the bulwark), when it's full width.
     */
    /**
     * Furniture (parametric boats P5, design.berthAt and the rest; shipyard/parts/furniture.ts;
     * the pieces' sizes are CONFIG.modules.furniture). Kept clear of: the helm's standing room
     * (`helmRoom`: either side of the wheel, aft of the console), the doorways (`doorWay`: across
     * the aft door, and in from the side door), room to sit at the chart table (`chartRoom` out
     * from it), the companionway and other openings (`holeClear` round them). A piece slides
     * along its wall up to `reach` each way from its pin to fit; more than `movedOver` from it,
     * the Shipyard says it moved. A head wants `headroom` under the ceiling. Priced as fit-out
     * (`pricePerKg`, GBP). The Furniture step opens with the section tool cut at a waterline
     * `planCut` (m) over the wheelhouse floor, seen from above (the roof and the top of the walls off).
     * A TV on the wall keeps `tvCeiling` (m) under the ceiling, coming down to do so, and its
     * screen's foot no lower than `tvLowest` over the floor (else it's left off).
     */
    furniture: { helmRoom: { halfWidth: 0.45, depth: 0.9 }, doorWay: { halfWidth: 0.5, depth: 0.9 }, chartRoom: 0.45, holeClear: 0.15, reach: 1.5, movedOver: 0.3, headroom: 1.9, pricePerKg: 40, planCut: 1.25, tvCeiling: 0.1, tvLowest: 0.8 },
    /**
     * The Shipyard's section tool (owner: "cut the ship through as you want"): her drawing cut by
     * a waterline (level), a buttock (fore and aft, upright) or a station (athwartships, upright)
     * plane, set anywhere along her with a slider in steps of `step` (m). Each starts where a
     * naval architect would look first: the waterline at the design waterline, the buttock on
     * the centreline, the station `stationAt` of her length forward of the transom (amidships).
     * What's cut shows its inside (her plating seen from within, as in a cut-away model); the
     * cut faces aren't filled in solid, as a hatched section on a drawing would be.
     */
    section: { step: 0.05, stationAt: 0.5 },
    /**
     * A fish hold (owner, Oct 2026: step 1 toward a trawler; design.fishHold, parts/hold.ts):
     * an insulated hold in her hull under the open deck, aft of the wheelhouse (or forward of
     * it if there's more room there), clear of the engine (`engineGap` from its ends), the
     * propeller and rudder (`aftClear` from the transom), the cabin below and a raised foredeck.
     * At least `minLength` long and `minDepth` deep, else left off saying why. Its floor
     * (`soleClear` over her bottom, `shaftClear` over the propeller shaft running under it) and
     * its sides (`frame` inside her hull at the floor) make a lined box, its ceiling the deck.
     * The hatch over it: `hatch.length` x `hatch.width` (smaller to fit, to `hatch.min`), its
     * coaming `hatch.coaming` high, clear of the deck gear by `hatch.clear`, as near the hold's
     * middle as it fits (along her first, then off to one side).
     * It holds as many fish boxes (CONFIG.cargo.kinds 'Fish box') as stack in it with
     * `boxGap` round each and `headGap` under the deck. Weighed as `kgPerM2` of insulated
     * lining over its inside plus the hatch's `hatch.kg`; priced at `pricePerM3` of hold.
     */
    /**
     * The stern trawler hull type (owner, Oct 2026; step 3 toward a trawler): her plating and
     * framing `scantlings` times the steel's usual (heavy, as a trawler is built), and permanent ballast
     * (kg) low in her hull, so she floats near her lines with her machinery, gear and a light
     * load (a trawler carries hers in fuel, ice and fixed ballast: a deep hull for a big
     * propeller, and a good GM with a heavy codend coming up over the stern).
     */
    sternTrawler: { scantlings: 1.8, ballastKg: 60000 },
    /**
     * The fast catamaran's plating and framing, against the material's usual (a monohull's): two
     * slim hulls carry far more plate for her length than one, but each is a small, short-
     * spanned section, built lighter. 0.8 puts the 12.5 m cat at about 12.7 t light on twin
     * 280 kW (13.5 t on the twin 400s she comes with), against about 11 to 13 t for real
     * aluminium work cats of her length (15 to 18 t at 15 m, scaled;
     * hull chat, Oct 2026). At 1 she came out about 14.5 t.
     */
    catamaran: { scantlings: 0.8 },
    fishHold: { engineGap: 0.15, aftClear: 0.75, minLength: 1.2, minDepth: 0.55, soleClear: 0.1, shaftClear: 0.15, frame: 0.06, hatch: { length: 0.9, width: 0.9, min: 0.6, coaming: 0.3, clear: 0.15, kg: 70 }, boxGap: 0.02, headGap: 0.05, kgPerM2: 18, pricePerM3: 1100 },
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
      walk: {
        margin: 0.25,
        railHeight: 0.9,
        postSpacing: 1.2,
        railKgPerM: 4,
        minFore: 0.6,
        ladder: { width: 0.45, depth: 0.45, kg: 20 },
        /**
         * The stair across the aft face of a deckhouse run on aft of the wheelhouse (owner, Oct
         * 2026: "a steep transverse stair" rather than a ladder; house.ts transverseStair): each
         * step at most `rise` (m) up and `tread` across her (about 54 degrees), `width` out from
         * the face; a `landing` that wide (across her) at its head; `kg` the stair and its rails.
         */
        stair: { rise: 0.3, tread: 0.22, width: 0.65, landing: 0.7, kg: 90 },
      },
      /**
       * Run on aft of the wheelhouse (design.dhAft; owner, Oct 2026: the stern trawler's deck
       * behind the bridge): it stops short of leaving less than this (m) of working deck
       * forward of her transom.
       */
      aftDeck: 4,
      /**
       * A cabin below it (parametric boats P2c, design.foreCabin; owner): its sole sunk so there's
       * `headroom` (m) under the trunk's top, but no lower than leaves the sole `minHalf` wide each
       * side of the centreline inside her hull (`hullClear` in from her plating) and `keelClear`
       * over her bottom; under `minHeadroom` it's left off. Its walls `wall` inside the trunk's.
       * The companionway: `stairWidth` wide beside the helm (`helmRoom` left for the helmsman),
       * steps no more than `rise` high (a walk step is 0.4: vessel/layout.ts) and `tread` deep,
       * stepping down forward from the wheelhouse floor; at least `minAhead` of cabin forward of
       * it. A V-berth across her forward end, `berth.length` long and `berth.top` over the sole,
       * if the cabin's at least `berth.minCabin` long. Its sole, lining and berth `kgPerM2` of
       * lining; drawn in `lining`, `trim` (the berth front, the treads) and `cushion`.
       */
      cabin: {
        headroom: 1.9,
        minHeadroom: 1.65,
        minHalf: 0.4,
        hullClear: 0.08,
        keelClear: 0.2,
        wall: 0.06,
        stairWidth: 0.7,
        helmRoom: 0.45,
        rise: 0.32,
        tread: 0.26,
        minAhead: 0.8,
        berth: { length: 1.1, top: 0.5, minCabin: 2.2 },
        kgPerM2: 12,
        lining: 0xd8d2c4,
        trim: 0x8a5d3c,
        cushion: 0x2b3a55,
      },
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
    /** A bow fender (design.bowFender, modules/bowFender): the moulded rubber block and its fitting (GBP). */
    bowFenderPrice: 6000,
    protection: { fendersPrice: 450, strakePerM: 110, tyrePrice: 90, tyreFitting: 600, fenders: 3 },
  },
};
