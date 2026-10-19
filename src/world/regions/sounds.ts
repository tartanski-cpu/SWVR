/**
 * Region `sounds`, "The Sounds" (the regions brief, region 1: Hebridean; higher and harder
 * than home: cliffs, sea lochs, skerries, heather, dark water). Original places; the names
 * are the game's own (Gaelic-flavoured placeholders the owner may rename).
 *
 * Where: north of home (-Z) across a 3.3 km sound. The direct line from Calder Haven to the
 * hill runs through Sruth Tarsk, the main race, in the sound between Eilean Garbh and Sgeir
 * Mhor; the narrow channel west of Eilean Garbh, inside Na Coin Ghlasa, has the smaller
 * race, Sruth nan Con.
 *
 * The spine:
 *   Loch Tarsk (harbour)   a sea loch cut into Tarsk's east side, the quay and the repair
 *                          yard at its head: fuel, cargo, repairs cheaper than home's and the
 *                          only yard that fits the radar and the heavy towing post
 *   Garbh Pier (pier)      a T-head pier on Eilean Garbh's south-west point, facing the
 *                          prevailing wind: workable in a westerly only while the sea is
 *                          slight (no shelter zone: the physics decides)
 *   Camas Tarsk (anchorage) the cliff inlet in Tarsk's south side: a tight entrance between
 *                          rocks on a leading line of two fixed lights (000°), sand bottom,
 *                          sheltered from everything but the south
 * Character: the two races, the inlet, the skerries (Sgeirean Dubha, Na Coin Ghlasa), a
 * lighthouse on Sgeir Mhor's south-east corner (Fl W 8 s), the isolated rock Bogha Ruadh in
 * the loch approach. Fish: haddock on Tarsk Bank, mackerel in the sound; prawns and lobster
 * on the rocky ground. Goods: feed and building materials in, whisky out.
 */
import type { RegionDef } from '../defs';

const S2 = Math.SQRT1_2;

export const SOUNDS: RegionDef = {
  id: 'sounds',
  name: 'The Sounds',
  bounds: { x0: -1500, x1: 2500, z0: -6500, z1: -1900 },
  landmarks: [
    // The cairn hill: 150 m on paper (its summit comes out at ~120 m), steep, bare above the heather line.
    { name: 'Cnoc Tarsk', kind: 'hill', x: 400, z: -4000, height: 150 },
    { name: 'Sgeir Mhor lighthouse', kind: 'lighthouse', x: 1185, z: -2365, height: 24 },
  ],
  islands: [
    {
      name: 'Tarsk',
      x: 400,
      z: -4000,
      radius: 420,
      height: 150,
      shape: [
        [2, 0.1, 1.2],
        [3, 0.07, 0.4],
        [5, 0.04, 2.6],
      ],
      beach: 4,
      seed: 21,
      trees: 0.08,
    },
    // West of the main race: a rocky island, the exposed pier on its south-west point.
    { name: 'Eilean Garbh', x: -150, z: -2500, radius: 300, height: 95, shape: [[2, 0.08, 0.7], [3, 0.06, 2.9]], beach: 3, seed: 22, trees: 0.05 },
    // East of the race: lower, the lighthouse on its south-east corner.
    { name: 'Sgeir Mhor', x: 1050, z: -2500, radius: 230, height: 60, shape: [[2, 0.1, 2.2], [4, 0.05, 0.9]], beach: 3, seed: 23, trees: 0 },
    // The grey dogs: skerries west of Eilean Garbh; the narrow channel between runs Sruth nan Con.
    { name: 'Na Coin Ghlasa', x: -700, z: -2450, radius: 90, height: 12, shape: [[3, 0.15, 0.5]], beach: 1, seed: 24, trees: 0 },
    { name: 'Na Coin Ghlasa', x: -640, z: -2620, radius: 60, height: 8, shape: [[2, 0.18, 1.6]], beach: 1, seed: 25, trees: 0 },
    { name: 'Na Coin Ghlasa', x: -760, z: -2320, radius: 50, height: 6, shape: [[3, 0.2, 2.4]], beach: 1, seed: 26, trees: 0 },
    // Black skerries east of Tarsk: lobster ground, a kayaker's downfall.
    { name: 'Sgeirean Dubha', x: 1350, z: -3300, radius: 45, height: 7, shape: [[3, 0.2, 0.3]], beach: 1, seed: 27, trees: 0 },
    { name: 'Sgeirean Dubha', x: 1420, z: -3380, radius: 35, height: 5, shape: [[2, 0.2, 1.9]], beach: 1, seed: 28, trees: 0 },
    { name: 'Sgeirean Dubha', x: 1300, z: -3420, radius: 30, height: 4, shape: [[3, 0.25, 2.8]], beach: 1, seed: 29, trees: 0 },
    // A lone rock awash in the loch approach, an isolated danger mark on it.
    { name: 'Bogha Ruadh', x: 1000, z: -3850, radius: 12, height: 0.9, shape: [[3, 0.25, 1.1]], beach: 0.5, seed: 30, trees: 0 },
    // Rocks on the passages (owner, after M6): on the straight lines between the regions'
    // harbours, so a crossing in fog is navigated, not steered blind. Charted, unlit.
    // Sgeir a' Cheò: on the line from Calder Haven to Loch Tarsk, at the race's east edge.
    { name: "Sgeir a' Cheò", x: 728, z: -1965, radius: 22, height: 3, shape: [[3, 0.2, 0.4]], beach: 0.5, seed: 31, trees: 0 },
    { name: "Sgeir a' Cheò", x: 698, z: -1932, radius: 12, height: 1.2, shape: [[2, 0.25, 1.3]], beach: 0.5, seed: 32, trees: 0 },
    // Sgeir Fhada: on the way from Loch Tarsk to the Fjord.
    { name: 'Sgeir Fhada', x: 2300, z: -4880, radius: 25, height: 3.5, shape: [[2, 0.3, 0.6]], beach: 0.5, seed: 33, trees: 0 },
    { name: 'Sgeir Fhada', x: 2340, z: -4905, radius: 10, height: 1, shape: [[3, 0.2, 2.1]], beach: 0.5, seed: 34, trees: 0 },
    // Bogha nan Ròn: on the way from Loch Tarsk to the Narrows.
    { name: 'Bogha nan Ròn', x: -690, z: -4270, radius: 18, height: 2.5, shape: [[3, 0.25, 1.7]], beach: 0.5, seed: 35, trees: 0 },
  ],
  // Big, high islands: inland above 12 m the terrain is drawn in 24 m cells (4 x 4 of the usual), the coast and shallows at 6 m: the Quest's budget.
  leanTerrain: { above: 12, cells: 4 },
  cuts: [
    // Loch Tarsk: a sea loch running 300 m west into Tarsk from its east shore, 9 m at the
    // mouth shoaling to 6 m at the head, where the quay is.
    { x: 780, z: -4000, radius: 120, depth: 9, edge: 40 },
    { x: 660, z: -4000, radius: 100, depth: 8, edge: 35 },
    { x: 560, z: -4000, radius: 85, depth: 6, edge: 30 },
    // Camas Tarsk: the cliff inlet in the south side, 12 m at the entrance, 9 m at the head.
    { x: 400, z: -3620, radius: 70, depth: 12, edge: 25 },
    { x: 400, z: -3720, radius: 95, depth: 11, edge: 35 },
    { x: 400, z: -3820, radius: 80, depth: 9, edge: 30 },
  ],
  flats: [
    // The loch head: the yard's ground, level with the quay.
    { x: 520, z: -4000, radius: 110, height: 2.0, edge: 60 },
    // The yard's ground behind the quay: the shed, the office, the cottages and the laid-up
    // boats on the level, the hill rising behind in a scarp (the Sounds are steep).
    { x: 590, z: -3925, radius: 140, height: 2.0, edge: 60 },
    // The beach at the head of the inlet.
    { x: 400, z: -3905, radius: 60, height: 1.5, edge: 40 },
    // Garbh Pier's root.
    { x: -345, z: -2305, radius: 40, height: 2.2, edge: 20 },
  ],
  ridges: [
    // The rocks that narrow Camas Tarsk's entrance to about 45 m: steer the leading line.
    { ax: 352, az: -3598, bx: 366, bz: -3642, crest: 2.5, halfWidth: 4, slope: 0.6 },
    { ax: 448, az: -3598, bx: 434, bz: -3642, crest: 2.5, halfWidth: 4, slope: 0.6 },
  ],
  blocks: [
    // Loch Tarsk quay: 80 m along the south side of the loch head, its face north into the water.
    { kind: 'quay', x: 600, z: -3940, halfLength: 40, halfWidth: 18, yawDeg: 90, top: 1.8, fendered: true },
    // Garbh Pier: 110 m out to the south-west from the island's point, then a 44 m T-head.
    { kind: 'pier', x: -420, z: -2230, halfLength: 55, halfWidth: 3, yawDeg: 45, top: 2.4, fendered: false },
    { kind: 'pier', x: -470, z: -2180, halfLength: 22, halfWidth: 5, yawDeg: 135, top: 2.4, fendered: true },
  ],
  buildings: [
    // Loch Tarsk: the yard shed, the office, two cottages.
    { x: 600, z: -3912, width: 16, depth: 11, height: 6, yawDeg: 90, wall: 0x7d8a84, roof: 0x4a4f54, cladding: 'sheet' },
    { x: 565, z: -3908, width: 7, depth: 6, height: 3.5, yawDeg: 90, wall: 0xe9e3d3, roof: 0x5a3a2a, cladding: 'render' },
    { x: 648, z: -3900, width: 8, depth: 7, height: 4, yawDeg: 80, wall: 0xf1ede2, roof: 0x3e3e3e, cladding: 'boards' },
    { x: 540, z: -3885, width: 8, depth: 6, height: 4, yawDeg: 95, wall: 0xd9c9a3, roof: 0x8a3a2a, cladding: 'boards' },
    // Garbh Pier: a store at the root.
    { x: -330, z: -2318, width: 10, depth: 7, height: 4.5, yawDeg: 45, wall: 0x8c9aa3, roof: 0x3e4a52, cladding: 'sheet' },
    // Camas Tarsk: a shieling above the beach.
    { x: 418, z: -3912, width: 5, depth: 4, height: 2.8, yawDeg: 10, wall: 0xd8d2c4, roof: 0x3a3a3a },
  ],
  yards: [
    {
      // The repair yard at the loch head: its crane at the quay edge, boats laid up by the shed.
      crane: { x: 630, z: -3956, jibDeg: 0 },
      boats: [
        { x: 585, z: -3895, headingDeg: 90, length: 10, beam: 3.4, depth: 1.8, house: true },
        { x: 620, z: -3892, headingDeg: 270, length: 7, beam: 2.6, depth: 1.3, house: false },
      ],
    },
  ],
  marks: [
    // Bogha Ruadh: an isolated danger mark on the rock itself.
    { name: 'Bogha Ruadh', kind: 'isolated', x: 1000, z: -3850 },
    // Sgeirean Dubha: pass north of the north mark or south of the south one.
    { name: 'Sgeirean Dubha N', kind: 'N', x: 1360, z: -3480 },
    { name: 'Sgeirean Dubha S', kind: 'S', x: 1360, z: -3230 },
    // Na Coin Ghlasa: west of the west mark, clear of the skerries and the small race.
    { name: 'Coin Ghlasa W', kind: 'W', x: -850, z: -2450 },
    // The loch approach, entering westward: red to port (south), green to starboard (north).
    { name: 'Tarsk No 1', kind: 'stbd', x: 900, z: -4030 },
    { name: 'Tarsk No 2', kind: 'port', x: 900, z: -3970 },
  ],
  wrecks: [],
  lights: [
    // Loch Tarsk's mouth, entering westward: the south head is on the port hand.
    { name: 'Loch Tarsk S head Fl R 4s', x: 780, z: -3878, y: 7, color: 'red', period: 4, tower: 'post' },
    { name: 'Loch Tarsk N head Fl G 4s', x: 800, z: -4115, y: 11, color: 'green', period: 4, tower: 'post' },
    { name: 'Garbh pier head F R', x: -470, z: -2180, y: 6, color: 'red', period: 0, tower: 'post' },
    // Sgeir Mhor: the lighthouse on the dangerous corner, seen from home across the sound.
    { name: 'Sgeir Mhor Fl W 8s', x: 1185, z: -2365, y: 24, color: 'white', period: 8, tower: 'lighthouse' },
    // Camas Tarsk's leading lights, in line on 000°: the front low, the rear high.
    { name: 'Camas ldg front F W', x: 400, z: -3908, y: 5, color: 'white', period: 0, tower: 'post' },
    { name: 'Camas ldg rear F W', x: 400, z: -3935, y: 27, color: 'white', period: 0, tower: 'post' },
  ],
  shelters: [
    // The loch: calm.
    { x: 600, z: -4000, rIn: 150, rOut: 320, factor: 0.1 },
    // The inlet: calm from every side but the south, where its mouth opens.
    { x: 400, z: -3740, rIn: 90, rOut: 210, factor: 0.15, openFromDeg: 180, openArcDeg: 40 },
  ],
  ports: [
    {
      id: 'tarsk',
      name: 'Loch Tarsk',
      kind: 'harbour',
      x: 850,
      z: -4000,
      fuel: { x: 575, z: -3960, radius: 14, pumpX: 578, pumpZ: -3953 },
      clearRadius: 170,
      cargo: { berth: { x: 625, z: -3960, radius: 16 }, stackX: 632, stackZ: -3949, stackYawDeg: 90, color: 0x8a4fc8 },
      economy: {
        // The reason to go: repairs at two thirds of home's rate, and the only yard that fits
        // the radar and the heavy towing post; whisky out, feed and building materials in.
        repairs: { hull: 0.65, engine: 0.65 },
        sells: ['radar', 'towPost', 'ice'],
        buys: { shellfish: 1.3 },
        products: ['Whisky cask'],
        needs: ['Feed sack', 'Building materials'],
      },
    },
    {
      id: 'garbh',
      name: 'Garbh Pier',
      kind: 'pier',
      x: -470,
      z: -2180,
      clearRadius: 70,
      // The goods on the T-head, along it from its middle.
      cargo: { berth: { x: -475, z: -2175, radius: 14 }, stackX: -464.3, stackZ: -2174.3, stackYawDeg: 135, color: 0x2f9a8a },
      economy: { products: ['Feed sack'], needs: ['Crate', 'Gas bottle'] },
    },
    {
      id: 'camas',
      name: 'Camas Tarsk (anchorage)',
      kind: 'anchorage',
      x: 400,
      z: -3560,
      clearRadius: 50,
      // The goods wait on the beach at the inlet's head, above the tide line.
      cargo: { anchorage: { x: 400, z: -3740, radius: 90 }, stackX: 384, stackZ: -3916, stackYawDeg: 90, color: 0xc8a030 },
      bottom: 'sand',
      economy: { needs: ['Sack', 'Crate'] },
    },
  ],
  berths: [
    // Loch Tarsk quay, north face at z = -3958: the boat lies east-west, the quay to the south.
    { id: 'tarsk-fuel', portId: 'tarsk', name: 'Loch Tarsk quay (fuel)', x: 575, z: -3960.5, headingDeg: 90, shoreX: 0, shoreZ: 1, shoreDist: 2.5, deckY: 1.8 },
    { id: 'tarsk-cargo', portId: 'tarsk', name: 'Loch Tarsk quay (cargo)', x: 625, z: -3960.5, headingDeg: 90, shoreX: 0, shoreZ: 1, shoreDist: 2.5, deckY: 1.8 },
    // Garbh Pier T-head, seaward (SW) face; the T-head runs 135°/315°.
    { id: 'garbh-cargo', portId: 'garbh', name: 'Garbh Pier T-head (cargo)', x: -475.3, z: -2174.7, headingDeg: 135, shoreX: S2, shoreZ: -S2, shoreDist: 2.5, deckY: 2.4 },
  ],
  slipways: [
    // Loch Tarsk: the yard's slip, east of the quay, down into the loch (northward). Its top
    // edge is on the shore (the yard's level ground, 2 m, ends at the loch's cut about
    // z = -3905 here), so it runs from the land into the water; it used to start 25 m out,
    // over the loch, on its own (owner, Oct 2026).
    { id: 'tarsk-slip', portId: 'tarsk', name: 'Loch Tarsk slipway', x: 665, z: -3902, headingDeg: 180, width: 6, length: 28, top: 2.0, slope: 1 / 8 },
  ],
  lamps: [
    { x: 570, z: -3925, y: 7.5 },
    { x: 610, z: -3925, y: 7.5 },
    { x: 638, z: -3925, y: 7.5 },
    { x: -400, z: -2250, y: 7 },
    { x: -455, z: -2195, y: 7 },
    { x: 420, z: -3918, y: 4.5 },
  ],
  portFloods: [
    { portId: 'tarsk', x: 605, y: 11, z: -3935 },
    { portId: 'garbh', x: -470, y: 10, z: -2182 },
    { portId: 'camas', x: 410, y: 6, z: -3915 },
  ],
  pottingGrounds: [
    { id: 'garbh-north', name: 'Eilean Garbh, north shore', x: -150, z: -2812, radius: 45, quality: 0.8 },
    { id: 'dubha', name: 'Sgeirean Dubha', x: 1360, z: -3350, radius: 70, quality: 0.9 },
    { id: 'coin', name: 'Na Coin Ghlasa', x: -700, z: -2560, radius: 60, quality: 0.8 },
  ],
  fishingGrounds: [
    { name: 'Tarsk Bank', x: 1500, z: -4300, radius: 350, richness: 1.1, species: 'haddock' },
    { name: 'The Sound', x: 470, z: -3250, radius: 280, richness: 1.3, species: 'mackerel' },
  ],
  fogBanks: [
    { x: 1360, z: -3350, r: 300, visibility: 200 },
    { x: -600, z: -2500, r: 260, visibility: 220 },
  ],
  currents: [
    // The main race, in the sound between Eilean Garbh and Sgeir Mhor: the shortest way north.
    { id: 'sruth-tarsk', name: 'Sruth Tarsk', x: 470, z: -2500, length: 900, width: 500, setDeg: 0, peakKn: 9, periodH: 6, phaseH: 0, waveFactor: 1.8, knocks: 4 },
    // The little race in the channel inside Na Coin Ghlasa: shorter still, 150 m wide.
    { id: 'sruth-nan-con', name: 'Sruth nan Con', x: -530, z: -2480, length: 420, width: 150, setDeg: 0, peakKn: 6, periodH: 6, phaseH: 0, waveFactor: 1.6, knocks: 2 },
  ],
  jobs: {
    tows: [
      // A creel boat broken down south of the race, drifting toward it: get her clear before it turns.
      { kind: 'dory', weight: 1, name: 'a creel boat with a broken-down engine, drifting toward Sruth Tarsk', at: { x: 470, z: -3120, r: 150 } },
      // A fish-farm cage section torn loose, adrift east of Tarsk.
      { kind: 'cage', weight: 0.8, at: { x: 1150, z: -3050, r: 200 } },
      { kind: 'yacht', weight: 0.5 },
    ],
    rescues: [
      // A kayaker off the black skerries.
      { def: 'kayaker', weight: 1, at: { x: 1360, z: -3350, r: 220 } },
      { def: 'manOverboard', weight: 0.4 },
    ],
  },
  // Rough-biased: fog and drizzle common, the odd glorious calm day.
  weather: {
    next: {
      Clear: { Clear: 1, Overcast: 3, Fog: 2 },
      Overcast: { Clear: 1, Rain: 3, Fog: 2 },
      Fog: { Overcast: 2, Rain: 1, Clear: 1 },
      Rain: { Overcast: 2, Squall: 2, Fog: 1 },
      Squall: { Rain: 2, Overcast: 1 },
    },
    hold: [420, 1000],
  },
};
