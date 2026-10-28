/**
 * The map's settings: coast regions, tidal currents, the chart origin, trees, skyline, place names, the shore and surf.
 *
 * Part of CONFIG (src/config.ts joins every area's file into it): read it as CONFIG.<key>,
 * as ever. Units are SI unless the name says otherwise.
 */

export const MAP_CONFIG = {
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
    /** The far chunks are one merged mesh, merged again at most this often (s) as the set of them changes. */
    coastFarRebuild: 0.5,
    /**
     * Keeping that merge rare (the review, 24 Oct 2026: a big map re-merged and re-sent its far
     * hills to the graphics chip as the boat moved or the visibility changed):
     *   coastFogStep    the fog's reach is rounded up to this step (m), so drifting visibility
     *                   doesn't change the far set every frame
     *   coastHysteresis a chunk keeps its coarse copy, or its place in the far set, this far (m)
     *                   past its line, so a boat on a line doesn't swap it back and forth
     *   coastResort     the chunks are re-sorted by distance only when the viewer has moved this far (m)
     *   coastFarAhead   a merge takes in the chunks within this far (m) beyond the fog too,
     *                   so the fog lifting a little needs no merge
     *   coastFarSlack, coastFarTidy  a chunk gone into the fog stays in the merged mesh,
     *                   unseen; when that's more than coastFarSlack of it, it's tidied, at most
     *                   every coastFarTidy s (one now drawn nearer leaves it at once: the far
     *                   grid is too coarse for a narrow sound and stands over its water)
     */
    coastFogStep: 500,
    coastHysteresis: 300,
    coastResort: 50,
    coastFarAhead: 2000,
    coastFarSlack: 0.25,
    coastFarTidy: 5,
    /** A chunk's coarse copy and its town are freed (memory back) beyond this many times the distance they're drawn within, and made again on coming back (the review: a long Clyde voyage kept every one it had passed). */
    coastDropFactor: 1.5,
    coastCoarseCell: 90,
    coastCoarseOverlap: 90,
    coastCoarseDrop: 1,
    /** The coarse chunks are drawn merged, in this many slices round the viewer (coastView mergeMid: a draw call a slice; the frustum leaves out those behind). */
    coastCoarseWedges: 8,
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
    /** ...each square made only as the viewer comes within that distance of it (and a square more), piece by piece, up to this many ms a frame; those round the start before the first frame (worldView CoastKit). */
    coastKitMs: 4,
    /**
     * On a standalone headset (the trees' device level, treesView.ts treeLevel: the Quest), the
     * coast maps' reach drawn shorter (owner, Oct 2026: Hamburg ran at 30-40 fps): the town's
     * buildings, the harbour kit's squares (and the map's own near structures), a container terminal's
     * stacks and its quay cranes within these (m); and the ground from 1 to 6 km out sampled
     * coarser (m; Ålesund at 35 fps: its mountains, a quarter of the triangles at 90 m).
     */
    coastQuest: { coastBuildingDistance: 1300, coastStructureDistance: 1600, stackDistance: 1800, craneDistance: 3500, coastCoarseCell: 125, coastCoarseOverlap: 125 },
    /** A mussel farm's long-line (a coast map's, the coast extras plan C2; worldView.buildFarm): one float every this many metres along it. */
    lineFloat: 6,
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
    /**
     * Overfalls (owner, Oct 2026: steeper seas in some places, harder to travel through):
     * wind waves meeting a tidal race running against them shorten and stand up. Inside a
     * running race, for each wave by how much it opposes the flow (`opp` = -(wave direction ·
     * flow) × strength × how far in, -1..1; the CPU and the ocean shader alike):
     *   heighten  the wave's height × (1 + heighten × opp) when opposing (on top of the
     *             zone's own waveFactor);
     *   steepen   its crest sharpness (the Gerstner orbit) × (1 + steepen × opp) more still;
     *   flatten   with the flow (opp < 0): height × (1 - flatten × |opp|), the sea eases;
     *   chop      `amplitude` m (× the sea scale) of chop on the sea's short trains
     *             (CONFIG.ocean.fetchSeas.trains, down the wind; they carry the wind sea in
     *             enclosed water too): where they oppose a running race (× max(opp, 0)).
     * The crest-loop limit (Σ Q·k·A < 1) is kept at the worst case (tests/overfalls.test.ts).
     */
    overfalls: {
      heighten: 0.35,
      steepen: 0.45,
      flatten: 0.3,
      // The chop's height (× the sea scale) on the short trains (CONFIG.ocean.fetchSeas.trains, which carry the wind sea too).
      chop: { amplitude: 0.12 },
    },
    slackBelowKn: 1.5,
    knock: { radius: 28, yaw: 0.07, roll: 0.08 },
    roar: { hearRange: 700, gain: 0.55 },
  },

  /**
   * The chart's grid (nav/geo.ts): the latitude and longitude of the world origin. The
   * archipelago is fictional; this just makes positions read like real ones.
   */
  nav: { originLat: 56.62, originLon: -5.95 },

  /**
   * A coast region's trees (the settlements brief, Part B; world/view/treesView.ts), scattered
   * from its forest map near the viewer: every tree within `nearDistance` (m), nearest first,
   * at most `maxNear` of them (the Quest's budget: each tree is 20-32 triangles), scattered
   * a `tile` m square at a time, placed again when the viewer has moved `moveAgain` m or a
   * big map's ground has streamed in or out (looked at every `refresh` s). Each species: its height range (m),
   * its crown's width as a share of its height, and how far it may lean (deg).
   */
  trees: {
    nearDistance: 320,
    maxNear: 1500,
    tile: 100,
    moveAgain: 15,
    refresh: 2,
    /** Placing the trees is spread over frames, this many milliseconds of it a frame (shown when done). */
    placeBudgetMs: 2,
    /**
     * The middle band (milestone 5): from nearDistance out to `midDistance` (m) a sparser
     * scatter (one tree in about `midThin`² of the near band's: a jittered grid, cheap to
     * make) of cheaper models (5-8 triangles: no trunk; the canopy hides their feet), crowns
     * `midScale` times bigger so the woods read as thick; at most `maxMid`; placed again after
     * `midMoveAgain` m.
     */
    midDistance: 800,
    maxMid: 2500,
    midThin: 1.7,
    midScale: 1.2,
    midMoveAgain: 40,
    /**
     * The far woods: a canopy, a bumpy flat-shaded surface over the wooded ground (a height
     * per kind of wood, m, falling to the ground at the wood's edge; none where the map is
     * thinner than `canopyMinDensity` of 15), on a `canopyCell` m grid, in `canopySquare` m
     * squares out to `canopyDistance` (m), all merged into one mesh (merged again at most
     * every `canopyRebuild` s). It isn't drawn within `canopyFrom` (m) of the viewer, where
     * the trees themselves stand, fading in over `canopyFade` m (dithered).
     */
    // (None: 0. Beyond the trees the woods are the ground's own colour, painted in when the
    // map is made (tools/coast mesh.ts, from the forest map). Owner, testing on the Quest: far
    // off a 3D canopy can't be told from flat colour, and a thin surface a few metres over the
    // ground is what shimmered; at 1.5 km it still did at Oban, so: "get rid of that level of
    // detail and just have a flat patch on the ground". The canopy's code and settings stay,
    // should it be wanted again.)
    canopyDistance: 0,
    canopyCell: 40,
    canopySquare: 2000,
    canopyRebuild: 0.5,
    canopyFrom: 290,
    canopyFade: 50,
    canopyMinDensity: 6,
    canopyBump: 3,
    canopyHeight: { plantation: 14, broadleaf: 11, mixed: 12, natural: 9, scrub: 1.4, orchard: 4 } as Record<string, number>,
    /**
     * Against shimmering in the distance (owner, testing on the Quest: "a little bit of Z
     * fighting ... where the forests areas are"). The camera's depth runs from 5 cm to 14 km,
     * so far off it can't tell surfaces a metre or two apart (about 1 m at 1 km, 5 m at 2 km),
     * and they flicker as the head moves. So: the canopy's top stands at `canopyTop` of its
     * kind's crown height (the middle band's trees, standing in it, rise clear of it, not level
     * with it); kinds lower than `canopyMinHeight` m (scrub, orchards) aren't in the canopy at
     * all (a metre or four over the ground: the ground's own colour shows them from afar); and
     * the canopy is drawn a little deeper than it is (`canopyDepthOffset`, polygon offset
     * factor and units), so where a tree stands in it the tree always wins.
     */
    canopyTop: 0.8,
    canopyMinHeight: 5,
    canopyDepthOffset: { factor: 1, units: 4 },
    /**
     * A desktop's graphics card (owner: "on my desktop it should be able to render the trees
     * from far away"; render/device.ts, Settings > Trees): the bands reach much farther, the
     * full trees to 900 m (up to 12,000 of them), the middle band to 3 km (up to 20,000: woods
     * a mile or two off are trees); no canopy (beyond, the woods are the ground's own colour,
     * as on the Quest); placed again after a longer move, there being
     * more of them, with 4 ms a frame to place them in (a desktop processor has it to spare).
     * The values above are the Quest's.
     */
    desktop: { nearDistance: 900, maxNear: 12000, midDistance: 3000, maxMid: 20000, canopyFrom: 870, canopyDistance: 0, moveAgain: 30, midMoveAgain: 120, placeBudgetMs: 4 },
    species: {
      conifer: { height: [9, 17] as [number, number], width: [0.36, 0.48] as [number, number], lean: 2 },
      broadleaf: { height: [6, 13] as [number, number], width: [0.75, 1.0] as [number, number], lean: 5 },
      birch: { height: [6, 11] as [number, number], width: [0.42, 0.58] as [number, number], lean: 6 },
      scrub: { height: [0.8, 2] as [number, number], width: [1.2, 2] as [number, number], lean: 0 },
      pine: { height: [6, 12] as [number, number], width: [0.8, 1.1] as [number, number], lean: 7 },
      olive: { height: [3.5, 6] as [number, number], width: [1.0, 1.4] as [number, number], lean: 6 },
    },
  },
  /**
   * A coast map's skyline (the coast extras plan, C2; world/view/skylineView.ts): castles,
   * towers, masts, chimneys, water towers, monuments, churches and wind turbines from the
   * map data, drawn wherever the fog allows.
   *   heights   how tall each kind stands where the map doesn't tag its height (m; a
   *             turbine's is its hub's)
   *   castleFootprint  a castle's keep is this share of its mapped span across, within
   *             [min, max] m (a curtain wall's span is far wider than its tower house)
   *   turbine   her blades turn from `cutIn` m/s, reach `rpm` at `rated`, and stop
   *             (feathered) above `cutOut`; each blade `blade` x her hub height long.
   *             She faces the wind.
   *   lights    the red obstruction lights after dark (darkness over `from`): on masts,
   *             turbines and chimneys over `chimneyLit` m tall; turbines' flashing
   *             together every `flash` s (half on), masts' steady; `size` x a harbour
   *             light's (CONFIG.lightPoints: bigger, being meant to be seen from afar).
   */
  skyline: {
    heights: { castle: 14, tower: 14, mast: 45, chimney: 35, water_tower: 22, monument: 9, turbine: 65, church: 18 } as Record<string, number>,
    castleFootprint: { share: 0.35, min: 8, max: 18 },
    turbine: { cutIn: 3, rated: 12, cutOut: 25, rpm: 15, blade: 0.6 },
    lights: { from: 0.35, chimneyLit: 35, flash: 2, size: 1.2 },
  },
  /**
   * Place names in the radio's calls (the coast extras plan, C4; world/places.ts): the nearest
   * name within `reach` m ("off Toward Point"), each rank down (a hamlet against a town) counting
   * `rankWeight` of its distance more; "in" a bay, sound or strait within `inside` m of its name.
   * On the chartplotter (nav/chartPlotter.ts) the names of rank r show when the screen spans at
   * most `plotterSpan[r - 1]` m.
   */
  places: { reach: 3000, rankWeight: 0.3, inside: 900, plotterSpan: [32000, 8000, 4000, 2000] },
  /**
   * Breaking waves on beaches (ocean/oceanView.ts, the shore in ocean.frag.glsl): a map of
   * the water's depth `span` m square round the viewer, `cells` across, baked `rowsPerFrame`
   * rows a frame and again when the viewer is `rebake` m from its middle. A wave breaks where
   * its height reaches about 0.78 of the depth (a surf beach's rule), so a calm sea breaks
   * only in the last few centimetres and a storm out to a couple of metres: foam there, out
   * to `maxDepth` m at most, and a line of wash in the last `wash` m of depth.
   */
  shore: { span: 3600, cells: 192, rowsPerFrame: 16, rebake: 700, maxDepth: 4, wash: 0.8 },

  /**
   * Surf on the shore (the coast extras plan, C5; world/surf.ts, heard by audio/surfAudio.ts):
   * the owner's rule, heard only with your engine off and the waves over a height.
   *   minHs, fullHs  the surf's height (m, significant, after the shelter) where it starts to be
   *             heard, and where it's at full
   *   rays, radii  where it's looked for: this many bearings round you, at these distances (m)
   *   near, hearRange  full within `near` m, fading to nothing at `hearRange`
   *   lee       a shore with its back to the waves is this share as loud as one they run onto
   *   spread    a long shore all round you is up to this much louder than one stretch
   *   kinds     each shore kind's mix (the shore map, C3): boom (a low thump as a breaker
   *             lands), wash (the broken water running up), hiss (spray, and shingle's
   *             rattle on the backwash); 'none' where the map says nothing (and the
   *             hand-built islands)
   *   every     a whole look round takes this long (s; a few bearings a frame)
   *   gain      its loudness at full (the Sea & effects bus)
   *   engineFade  how fast it fades out when your engine starts and back when it stops (s)
   */
  surf: {
    minHs: 0.4,
    fullHs: 2.0,
    rays: 24,
    radii: [10, 25, 45, 70, 100, 140, 190, 250, 320, 400, 500],
    near: 40,
    hearRange: 500,
    lee: 0.3,
    spread: 0.3,
    kinds: {
      none: { boom: 0.5, wash: 0.8, hiss: 0.4 },
      sand: { boom: 0.25, wash: 1, hiss: 0.3 },
      shingle: { boom: 0.3, wash: 0.65, hiss: 1 },
      rock: { boom: 1, wash: 0.6, hiss: 0.5 },
      cliff: { boom: 1, wash: 0.45, hiss: 0.6 },
    } as Record<'none' | 'sand' | 'shingle' | 'rock' | 'cliff', { boom: number; wash: number; hiss: number }>,
    every: 0.5,
    gain: 0.55,
    engineFade: 1.5,
  },
  /**
   * Live weather on the Voyage maps (owner: "real-time weather in those locations ... every
   * time you start a game session ... a forecast"; world/coastWeather.ts). At the start of a
   * session the current conditions at the map's point (VoyageMap.weatherAt) are fetched
   * from Open-Meteo (free, no key; its terms ask for the credit line `credit`), the weather
   * model's for the wind, cloud, rain and visibility and the marine model's for the sea:
   *   timeoutMs   given up after this (ms): the game's own weather, as before
   *   rainMmH     precipitation (mm an hour) for the game's rain at full (light rain 0.5
   *               mm/h is about a third)
   *   maxVisibility  the game draws no farther than its clearest preset (m)
   *   fog, squallWind  under `fog` m visibility it's the Fog preset; a wind of `squallWind`
   *               m/s or more, or thunder, the Squall; rain over `rainy`, Rain; cloud over
   *               `overcast`, Overcast; else Clear (the nearest of the game's presets, for
   *               what the presets carry besides: the sky, the forecast's wording)
   */
  liveWeather: {
    forecastUrl: 'https://api.open-meteo.com/v1/forecast',
    marineUrl: 'https://marine-api.open-meteo.com/v1/marine',
    timeoutMs: 8000,
    rainMmH: 4,
    maxVisibility: 20000,
    fog: 1000,
    squallWind: 15,
    rainy: 0.15,
    overcast: 0.6,
    credit: 'Weather data by Open-Meteo.com (CC BY 4.0)',
  },
  /**
   * Bridges over the sea and follies on the coast maps (the landmarks and bridges pass;
   * world/coastStructures.ts, drawn by world/view/coastView.ts as one mesh).
   *   deckDepth   a deck's thickness (m)
   *   cantilever  `panel` m between a truss's verticals; the suspended span is `suspended`
   *               of the gap between the banks' piers, its truss `suspendedDepth` m deep under
   *               the deck; the anchor arm `anchorDepth` m deep at the abutment
   *   beamSpan    a beam bridge's piers this far apart over the water (m)
   *   folly       a ring of arches: `tiers` tiers in `height` m (when the map gives none), a
   *               pier `pier` m wide every `bay` m round it, walls `thick` m thick, a sill
   *               `sill` m high under the lower openings, a `band` m band over each tier's,
   *               a `cornice` m cornice on top
   */
  structures: {
    deckDepth: 0.8,
    panel: 10,
    suspended: 0.3,
    suspendedDepth: 2.5,
    anchorDepth: 2,
    beamSpan: 30,
    colours: { steel: 0x4c5a55, deck: 0x55585a, stone: 0x8a8478 },
    /**
     * A cable-stayed bridge's main span (the map request's `bridgePylons`: the Köhlbrandbrücke):
     * each pylon an A-frame, its legs `leg` m square from `legOut` m outside the deck's edges
     * up to a head `headHalf` m either side of its middle; `stays` stays a side of each fan,
     * their anchorages `anchorStep` m apart down the head, `stay` m thick; the approaches on
     * piers every `approachSpan` m. White concrete pylons, pale grey stays.
     */
    /**
     * The harbour kit's piers and quays (world/view/worldView.ts buildBlock; owner, Oct 2026:
     * Hamburg's piers were the biggest share of the triangles): a pier's piles every
     * `pileSpacing` m each side, `pileRadius` m, `pileSides` sides, open-ended, its outer piles
     * its fenders; a quay's fender boards every `fenderSpacing` m.
     */
    kit: { pileSpacing: 9, pileRadius: 0.3, pileSides: 5, fenderSpacing: 8 },
    /**
     * A coast map's own structures (coastView.ts): the small ones (bridges under `farBridge`'s
     * deck height and length, a container yard's stacking cranes, museum ships, floating docks)
     * in squares `nearCell` m, drawn within the harbour kit's reach; the skyline's always.
     */
    nearCell: 1000,
    farBridge: { deck: 20, length: 400 },
    cableStayed: { leg: 3.5, legOut: 4, headHalf: 2.5, stays: 9, anchorStep: 2.2, stay: 0.4, approachSpan: 45, colour: 0xe6e6e0, stayColour: 0xc8ccd0 },
    /**
     * A landmark modelled from the map's 3D building parts (Hamburg): the colours where the map
     * gives none (a wall by its material, else `wall`; a roof `roof`, copper verdigris); the
     * roofs' profiles in rings, [share of the footprint's size, share of the roof's height] from
     * the eaves up; the wave crown (the Elbphilharmonie's): `waves` crests along its length,
     * `depth` m from crest to trough, the walls' corners every `step` m, its roof `crownRoof`.
     */
    landmark: {
      wall: 0xc8b8a0,
      roof: 0x5a5e62,
      crownRoof: 0xf2f2ee,
      material: { brick: 0x9a4a32, sandstone: 0xd8c8a0, glass: 0xa6c0cc, copper: 0x4b7869, metal: 0x9aa0a4, concrete: 0xb8b4ac, stone: 0xa8a090, plaster: 0xe6dcc6 },
      profiles: {
        pyramidal: [[1, 0], [0, 1]],
        dome: [[1, 0], [0.92, 0.38], [0.7, 0.71], [0.38, 0.92], [0, 1]],
        onion: [[1, 0], [1.22, 0.22], [1.08, 0.45], [0.62, 0.68], [0.22, 0.88], [0, 1]],
        hip: [[1, 0], [0.3, 1]],
      } as Record<string, readonly (readonly [number, number])[]>,
      wave: { waves: 2.5, depth: 22, step: 6 },
    },
    /**
     * Museum ships (Hamburg's; coastStructures.ts museumShipParts), as shares of her length and m:
     * her bow fines from `bowFrom` of her length forward; red to `boot` m over the waterline.
     *   cargo   draught and freeboard to her main deck; forecastle from [share, height up],
     *           poop to [share, height]; her superstructure from `house` [aft, fore] shares in
     *           `tier` m tiers, each [set in from her side, stepped back from its front] m; her
     *           funnel [at, length, breadth, height]; hatches and kingposts (pairs `postApart` m
     *           apart, `post` m tall, derricks `derrick` m) at shares of her length
     *   barque  draught, freeboard, forecastle and poop the same; a white `band` [from, to] m
     *           under her rail; her masts at shares of her length by how many (`mastAt`), the
     *           mainmast `mainHeight` of her length over the deck, the fore `foreShare` of it
     *           and the aftmost `aftShare`; the yards [height share, span in beams]; her
     *           bowsprit reaching `bowsprit` of her length past the stem
     */
    museumShip: {
      bowFrom: 0.16,
      boot: 0.4,
      cargo: {
        draught: 7,
        freeboard: 5.5,
        forecastle: [0.37, 2.6] as [number, number],
        poop: [-0.4, 2.4] as [number, number],
        house: [-0.17, 0.03] as [number, number],
        tier: 2.8,
        tiers: [[0.6, 0], [1.4, 2.5], [2.6, 5], [4.5, 8]] as [number, number][],
        funnel: [-0.11, 9, 5, 8] as [number, number, number, number],
        hatches: [0.24, 0.1, -0.29],
        kingposts: [0.31, 0.17, -0.24, -0.35],
        postApart: 6,
        post: 13,
        derrick: 12,
        colours: { hull: 0xf2f2ee, boot: 0x9a2a22, deck: 0x8a7a68, house: 0xf2f2ee, funnelTop: 0xb02a22, hatch: 0x3a5040, post: 0xd8c8a0 },
      },
      barque: {
        draught: 5.5,
        freeboard: 4,
        forecastle: [0.39, 1.8] as [number, number],
        poop: [-0.37, 2] as [number, number],
        band: [0.8, 1.8] as [number, number],
        mastAt: { 2: [0.2, -0.15], 3: [0.27, 0.02, -0.24], 4: [0.3, 0.1, -0.1, -0.3], 5: [0.32, 0.16, 0, -0.16, -0.32] } as Record<number, number[]>,
        mainHeight: 0.5,
        foreShare: 0.96,
        aftShare: 0.82,
        yards: [[0.3, 1.9], [0.43, 1.75], [0.56, 1.55], [0.68, 1.35], [0.8, 1.12], [0.91, 0.88]] as [number, number][],
        bowsprit: 0.16,
        colours: { hull: 0x1e1e22, boot: 0x9a2a22, deck: 0xb09878, band: 0xf2f0ea, house: 0xf2f0ea, mast: 0xc8b090, yard: 0x2a2a2a },
      },
    },
    /**
     * A floating dock (Blohm + Voss's): the pontoon from [bottom, top] m about the water; its wing
     * walls `wallShare` of the dock's breadth high, between `wallHeight` limits (m), at least
     * `wallThick` m thick; a crane on each wall, `tower` m tall with a `jib` m jib.
     */
    floatingDock: {
      pontoon: [-7, 1.5] as [number, number],
      wallShare: 0.42,
      wallHeight: [12, 20] as [number, number],
      wallThick: 4,
      crane: { tower: 12, jib: 28 },
      colours: { pontoon: 0x2e3236, wall: 0x50606a, coping: 0xc8ccd0, crane: 0xe0b030 },
    },
    /**
     * A graving dock (Dock Elbe 17): its gate `gateThick` m thick from `gateFoot` m to the quay;
     * two portal cranes along its side: the portal `portal` m square and `portalHeight` m high,
     * the tower to `tower` m, a `jib` m jib.
     */
    /**
     * A container terminal (Hamburg's; laid out by the pipeline, drawn instanced by coastView.ts):
     *   crane   a ship-to-shore crane: `gauge` m between its rails, its legs `legSpan` m apart
     *           along them, `leg` m thick, its portal `portal` m high; the boom `outreach` m out
     *           over the water and `backreach` m back; the A-frame's head `apex` m over the boom
     *   stacks  a block `block` [long, wide] m in `split` [along, across] stacks, `gap` m apart,
     *           each `tiers` [least, most] containers of `tier` m high, in the `colours`
     *   distance a terminal's stacks are drawn within this of the viewer (m); its cranes always
     */
    terminal: {
      crane: { gauge: 30, legSpan: 18, leg: 1.8, portal: 42, outreach: 62, backreach: 22, apex: 28, colours: { frame: 0x2f5f9f, boom: 0xe8e8e4, house: 0xf2f2ee, stay: 0x3a3e44 } },
      stacks: {
        block: [60, 22] as [number, number],
        split: [2, 2] as [number, number],
        gap: 1.6,
        tiers: [1, 5] as [number, number],
        tier: 2.6,
        colours: [0xa8201c, 0x1d4f9a, 0xe8a020, 0x2a7a4a, 0xd8d8d0, 0x7a3a2a, 0x5a6266, 0x2a8aa8, 0x8a1a4a, 0xc8601a],
      },
      distance: 2500,
    },
    gravingDock: {
      gateThick: 10,
      gateFoot: -10,
      crane: { portal: 10, portalHeight: 12, tower: 40, jib: 50 },
      colours: { gate: 0x50606a, crane: 0xe0b030 },
    },
    /**
     * A shipyard's gantry crane (Perno): the top of its girder above the rails (m), the girder's
     * depth and width, its legs' section and how far apart each A-frame's feet stand along the
     * rails, where its gantries stand along the track (shares of its length, for one, two or
     * more), the T-crane on top of one leg (mast height, jib length), the hoist's drop below
     * the girder. An original low-poly form to the map's track, not a copy of the yard's; the
     * yard's name along the girder where the map asks for it (`signHeight`).
     */
    gantry: {
      /** A goliath this wide between its rails or more (m) is drawn full size (Perno's is 156 m);
       *  a narrower gantry (a container yard's stacking crane, 40 m) is scaled down by its span. */
      fullSpan: 150,
      /** Under this share of full size, no T-crane on top and no sign: a stacking crane, not a goliath. */
      bareBelow: 0.5,
      height: 100,
      girderDepth: 11,
      girderWidth: 9,
      leg: 4,
      legBase: 34,
      at: [[0.5], [0.3, 0.7], [0.2, 0.5, 0.8]] as number[][],
      mast: 20,
      jib: 42,
      hoist: 45,
      /** The sign along its girder (the map's `gantrySign`): its letters' height (m). */
      signHeight: 6.5,
      colours: { frame: 0x2c55a8, trolley: 0xf2a040, crane: 0xf0c840, dark: 0x3a3e44, rail: 0x55585a, sign: 0xffffff },
    },
    /**
     * A cruise ship under construction at a yard (Perno), an original design: decks of `deck` m,
     * `hullDecks` of them in her hull to the main deck and `decks` on top when finished (owner:
     * the Icon class is about 20 decks high, 5 of them in the hull); finished, her blue band
     * `band` of her freeboard, white above; her superstructure from `aft` to `fore` (shares of her length from the
     * stern: owner, from the Icon class, it runs nearly to her bow), its decks from the
     * `overhangFrom`th up `superWidth` times her hull's width (the overhang over her lifeboats),
     * over a full bow (the last `bowLength` of her, the larger `bowFullness` the fuller); its front raked back `rake` m a deck (owner: "less sloped") and rounded in three
     * facets, the two outer swept back `frontFacet` of her beam; terraced aft every `terrace` decks by
     * `terraceStep` m; her blocks `block` m long. Finished, lifeboats every `boatEvery` m along
     * `boatSpan` of her length. Colours: the finished ship's white and blue hull, red bottom,
     * the blocks' primer and light grey, the windows' band, the lifeboats, funnel and
     * water-park; the yard's luffing cranes (`cranes` along each ship).
     */
    yardShip: {
      hullDecks: 5,
      deck: 3,
      decks: 15,
      band: 0.7,
      aft: 0.04,
      fore: 0.9,
      bowLength: 0.2,
      bowFullness: 2.2,
      superWidth: 1.2,
      overhangFrom: 3,
      rake: 0.6,
      frontFacet: 0.2,
      terrace: 3,
      terraceStep: 7,
      block: 24,
      boatEvery: 15,
      boatSpan: [0.3, 0.68] as [number, number],
      cranes: 2,
      colours: { hull: 0x1f3f8a, white: 0xffffff, glass: 0x7f93a8, red: 0x9a2a24, primer: 0x8e9396, light: 0xb9bdbf, boat: 0xf08a28, funnel: 0xffffff, park: [0xd8402c, 0x2e7fd0, 0xf0c030, 0x3aa86a, 0x8a4fc0], crane: 0xf0c840 },
    },
    folly: { height: 11, tiers: 2, bay: 3.8, pier: 1.3, thick: 1.2, sill: 0.8, band: 1.2, cornice: 0.8, colours: { wall: 0xb9b2a4, cornice: 0xa39c8e } },
  },
};
