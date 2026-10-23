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
     *   chop      two short wind-wave components in the sea, `amplitude` m (× the sea scale)
     *             at `periods` s, travelling `spreadDeg` either side of the main wave: nowhere
     *             but where they oppose a running race (× max(opp, 0)).
     * The crest-loop limit (Σ Q·k·A < 1) is kept at the worst case (tests/overfalls.test.ts).
     */
    overfalls: {
      heighten: 0.35,
      steepen: 0.45,
      flatten: 0.3,
      chop: { amplitude: 0.12, periods: [2.6, 2.1] as readonly number[], spreadDeg: 15 },
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
};
