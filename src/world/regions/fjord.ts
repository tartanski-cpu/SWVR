/**
 * Region `fjord`, "The Fjord" (the regions brief, region 2: Norwegian). A long fjord cut
 * into a mountain mass north-east of the Sounds, between walls that rise to snow; pine on
 * the lower slopes, a village on a shelf at the head, waterfalls. Original places; the
 * names are the game's own (Norwegian-flavoured placeholders the owner may rename).
 *
 * Where: one gap out beyond the Sounds, to the north-east. Its mouth looks south-west
 * toward Loch Tarsk across about 3 km of open water; Kvasstind, the mountain, is the
 * landmark seen from the Sounds and from home.
 *
 * The spine:
 *   Kvassvik (harbour)        the village at the fjord's head: fuel at the cheapest price in
 *                             the islands and the fish farm's shore base (the reason to go)
 *   Ytterbrygga (pier)        a pier on the open coast just south of the fjord mouth, facing
 *                             the prevailing south-westerly: workable only while the sea is
 *                             slight (no shelter: the physics decides)
 *   Trangvika (anchorage)     a basin at the end of Trangfjorden, the side fjord: mud
 *                             bottom, sheltered from everything; the only way in is the
 *                             100 m wide gut between high walls, with no room to turn
 * Character: Kvasstraumen, the race in the narrows at the fjord mouth (8 kn at peak, whirl
 * patches); the narrow side fjord; katabatic gusts off the mountains (sudden squalls in
 * otherwise light weather: `gusts` and the profile's `katabatic`); the fish farm off the
 * village, its feed barge a port of its own. Fish: cod outside the mouth, halibut in the deep
 * of the fjord. Goods: salmon out of the farm, feed pellets in over the outer pier, timber
 * out of the village.
 */
import type { RegionDef } from '../defs';

const S2 = Math.SQRT1_2;

export const FJORD: RegionDef = {
  id: 'fjord',
  name: 'The Fjord',
  bounds: { x0: 2800, x1: 7800, z0: -9600, z1: -4700 },
  landmarks: [
    { name: 'Kvasstind', kind: 'hill', x: 5800, z: -7900, height: 760 },
    { name: 'Kvassnes lighthouse', kind: 'lighthouse', x: 3760, z: -5865, height: 34 },
  ],
  islands: [
    // The mountain mass the fjord is cut into: a plateau of rounded tops at 300-550 m that
    // rises steeply from the shore (rise 0.3).
    {
      name: 'Kvassland',
      x: 5300,
      z: -7100,
      radius: 2000,
      height: 560,
      shape: [
        [2, 0.1, 0.8],
        [3, 0.06, 2.0],
        [5, 0.03, 1.1],
      ],
      beach: 3,
      seed: 41,
      trees: 0.012,
      rise: 0.3,
    },
    // Kvasstind: the peak standing out of the plateau north of the fjord.
    { name: 'Kvasstind', x: 5800, z: -7900, radius: 650, height: 760, shape: [[3, 0.08, 0.4]], beach: 1, seed: 42, trees: 0, rise: 0.95 },
    // Mellomskjæra: rocks on the passage from Loch Tarsk (owner, after M6: a crossing in fog
    // must be navigated). Charted, unlit.
    { name: 'Mellomskjæra', x: 2942, z: -5267, radius: 24, height: 3, shape: [[3, 0.2, 0.9]], beach: 0.5, seed: 44, trees: 0 },
    { name: 'Mellomskjæra', x: 2905, z: -5290, radius: 12, height: 1.2, shape: [[2, 0.25, 0.2]], beach: 0.5, seed: 45, trees: 0 },
  ],
  // Big, high land: inland above 12 m the terrain is drawn in 36 m cells (the Quest's budget;
  // the walls and tops are hundreds of metres high, so the shape holds).
  leanTerrain: { above: 0.5, cells: 6 },
  channels: [
    // Kvassfjorden: from the open sea through the narrows at the mouth (210 m wide, the
    // race), opening to about 450 m, 3 km in to the head.
    {
      name: 'Kvassfjorden',
      points: [
        [3450, -5250, 260],
        [3900, -5700, 150],
        [4050, -5850, 105],
        [4400, -6200, 105],
        [4750, -6450, 220],
        [5300, -6650, 240],
        [5900, -6850, 230],
        [6400, -7200, 250],
        [6650, -7450, 160],
      ],
      depth: 38,
      edge: 90,
    },
    // Trangfjorden: the side fjord north from the junction, a 100 m gut for 600 m, then the basin.
    {
      name: 'Trangfjorden',
      points: [
        [5300, -6750, 50],
        [5260, -7100, 50],
        [5210, -7400, 60],
      ],
      depth: 22,
      edge: 70,
    },
    // Kvassdalen: the valley running up from the fjord's head, its floor 2 m above the sea
    // (a negative depth), the walls rising either side: the village stands on its floor.
    {
      name: 'Kvassdalen',
      points: [
        [6640, -7580, 110],
        [6800, -7820, 90],
        [6960, -8080, 60],
      ],
      depth: -2,
      edge: 170,
    },
  ],
  cuts: [
    // Trangvika: the basin at the end of the side fjord, 14 m: room to anchor and swing.
    { x: 5160, z: -7630, radius: 240, depth: 14, edge: 90 },
  ],
  flats: [
    // Ytterbrygga's root.
    { x: 4125, z: -5480, radius: 35, height: 2.4, edge: 20 },
    // Trangvika: a shelf at the head of the basin, under the walls; the basin's edge runs
    // up to it as a beach. (Outside the basin's cut: a flat inside a cut's edge is dug
    // down with it.)
    { x: 5150, z: -7885, radius: 90, height: 1.5, edge: 40 },
  ],
  ridges: [
    // Skjæret: a rock awash in the fjord off the junction, an isolated danger mark on it. A
    // mound (ridges are laid on after the channels; an island here would be cut away).
    { ax: 6114, az: -6940, bx: 6126, bz: -6940, crest: 0.6, halfWidth: 5, slope: 0.45 },
  ],
  blocks: [
    // Kvassvik quay: 80 m along the head of the fjord, its face south into the water.
    { kind: 'quay', x: 6660, z: -7628, halfLength: 40, halfWidth: 10, yawDeg: 90, top: 1.8, fendered: true },
    // Ytterbrygga: 100 m out to the south-west from the coast, then a 36 m T-head.
    { kind: 'pier', x: 4074, z: -5446, halfLength: 50, halfWidth: 3, yawDeg: 235, top: 2.4, fendered: false },
    { kind: 'pier', x: 4030, z: -5416, halfLength: 18, halfWidth: 5, yawDeg: 145, top: 2.4, fendered: true },
    // The fish farm's feed barge, moored by the cages.
    { kind: 'barge', x: 6660, z: -7330, halfLength: 12, halfWidth: 5, yawDeg: 45, top: 1.6, fendered: true },
  ],
  buildings: [
    // Kvassvik: the boathouse and the farm's shore base on the quay, the village behind on
    // the valley floor (weatherboard, red, ochre and white), its chapel.
    { x: 6635, z: -7645, width: 12, depth: 9, height: 5, yawDeg: 90, wall: 0x9a2b1f, roof: 0x2f2f2f, cladding: 'boards' },
    { x: 6700, z: -7650, width: 18, depth: 10, height: 6, yawDeg: 90, wall: 0x7f8c8d, roof: 0x3e4448, cladding: 'sheet' },
    { x: 6600, z: -7685, width: 8, depth: 7, height: 4, yawDeg: 90, wall: 0xc9972e, roof: 0x2b2b2b, cladding: 'boards' },
    { x: 6642, z: -7700, width: 8, depth: 7, height: 4, yawDeg: 85, wall: 0xeeeae0, roof: 0x3a3a3a, cladding: 'boards' },
    { x: 6690, z: -7705, width: 9, depth: 7, height: 4.5, yawDeg: 95, wall: 0x8f2a20, roof: 0x333333, cladding: 'boards' },
    { x: 6738, z: -7690, width: 8, depth: 6, height: 4, yawDeg: 90, wall: 0xd8b850, roof: 0x2e2e2e, cladding: 'boards' },
    { x: 6668, z: -7748, width: 8, depth: 7, height: 4, yawDeg: 80, wall: 0xf0ece2, roof: 0x3a3a3a, cladding: 'boards' },
    { x: 6720, z: -7762, width: 9, depth: 7, height: 4, yawDeg: 100, wall: 0x8f2a20, roof: 0x333333, cladding: 'boards' },
    { x: 6618, z: -7760, width: 7, depth: 13, height: 6, yawDeg: 0, wall: 0xf4f1ea, roof: 0x353535, cladding: 'boards' },
    // Ytterbrygga: a store at the root.
    { x: 4138, z: -5472, width: 9, depth: 6, height: 4, yawDeg: 235, wall: 0x8c9aa3, roof: 0x3e4a52, cladding: 'sheet' },
    // Trangvika: a cabin above the beach.
    { x: 5152, z: -7898, width: 5, depth: 4, height: 2.8, yawDeg: 0, wall: 0x8f2a20, roof: 0x3a3a3a, cladding: 'boards' },
  ],
  marks: [{ name: 'Skjæret', kind: 'isolated', x: 6120, z: -6940 }],
  wrecks: [],
  lights: [
    // Kvassnes: the lighthouse on the north head of the fjord mouth, over the race.
    { name: 'Kvassnes Fl W 6s', x: 3760, z: -5865, y: 34, color: 'white', period: 6, tower: 'lighthouse' },
    // Trangfjorden's gut, entering northward: red to port (west), green to starboard (east).
    { name: 'Trangfjord W Fl R 3s', x: 5212, z: -6968, y: 21, color: 'red', period: 3, tower: 'post' },
    { name: 'Trangfjord E Fl G 3s', x: 5345, z: -6968, y: 31, color: 'green', period: 3, tower: 'post' },
    { name: 'Kvassvik quay F G', x: 6700, z: -7619, y: 6, color: 'green', period: 0, tower: 'post' },
    { name: 'Ytterbrygga pier head F R', x: 4030, z: -5416, y: 6, color: 'red', period: 0, tower: 'post' },
  ],
  shelters: [
    // Inside the fjord: calmer than outside (the narrows break the sea).
    { x: 5700, z: -6850, rIn: 500, rOut: 900, factor: 0.35 },
    // Trangvika: shut in by the walls.
    { x: 5160, z: -7630, rIn: 200, rOut: 380, factor: 0.12 },
  ],
  ports: [
    {
      id: 'kvassvik',
      name: 'Kvassvik',
      kind: 'harbour',
      x: 6660,
      z: -7520,
      fuel: { x: 6640, z: -7615.5, radius: 14, pumpX: 6640, pumpZ: -7622 },
      clearRadius: 140,
      cargo: { berth: { x: 6685, z: -7615.5, radius: 16 }, stackX: 6690, stackZ: -7626, stackYawDeg: 90, color: 0xc0302a },
      economy: {
        // The reason to go: the cheapest fuel in the islands (the farm's tanker calls here),
        // and the farm's shore base. Timber out; building materials and gas in.
        fuelPrice: 0.95,
        repairs: false,
        products: ['Timber'],
        needs: ['Building materials', 'Gas bottle'],
      },
    },
    {
      id: 'kvassfarm',
      name: 'Kvass fish farm (feed barge)',
      kind: 'pier',
      x: 6660,
      z: -7330,
      clearRadius: 40,
      // Alongside the barge's north-west side; the goods on its deck.
      cargo: { berth: { x: 6654.7, z: -7335.3, radius: 14 }, stackX: 6658.6, stackZ: -7331.4, stackYawDeg: 45, color: 0xe878a8 },
      economy: { repairs: false, products: ['Salmon box'], needs: ['Feed pellets'] },
    },
    {
      id: 'ytterbrygga',
      name: 'Ytterbrygga',
      kind: 'pier',
      x: 4030,
      z: -5416,
      clearRadius: 70,
      // The goods on the T-head, along it from its middle.
      cargo: { berth: { x: 4024, z: -5412, radius: 14 }, stackX: 4028.8, stackZ: -5415.1, stackYawDeg: 145, color: 0x38c8e0 },
      // The feed ship lands the farm's pellets here, on the open coast.
      economy: { repairs: false, products: ['Feed pellets'], needs: ['Timber', 'Crate'] },
    },
    {
      id: 'trangvika',
      name: 'Trangvika (anchorage)',
      kind: 'anchorage',
      x: 5160,
      z: -7630,
      clearRadius: 50,
      // The goods wait at the cabin above the beach.
      cargo: { anchorage: { x: 5160, z: -7630, radius: 160 }, stackX: 5135, stackZ: -7880, stackYawDeg: 90, color: 0x8a5a2b },
      bottom: 'mud',
      economy: { repairs: false, needs: ['Crate', 'Sack'] },
    },
  ],
  berths: [
    // Kvassvik quay, south face at z = -7618: the boat lies east-west, the quay to the north.
    { id: 'kvassvik-fuel', portId: 'kvassvik', name: 'Kvassvik quay (fuel)', x: 6640, z: -7615.5, headingDeg: 90, shoreX: 0, shoreZ: -1, shoreDist: 2.5, deckY: 1.8 },
    { id: 'kvassvik-cargo', portId: 'kvassvik', name: 'Kvassvik quay (cargo)', x: 6685, z: -7615.5, headingDeg: 90, shoreX: 0, shoreZ: -1, shoreDist: 2.5, deckY: 1.8 },
    // The feed barge, its north-west side.
    { id: 'kvassfarm-cargo', portId: 'kvassfarm', name: 'Feed barge (cargo)', x: 6654.7, z: -7335.3, headingDeg: 45, shoreX: S2, shoreZ: S2, shoreDist: 2.5, deckY: 1.6 },
    // Ytterbrygga T-head, seaward (SW) face; the T-head runs 145°/325°.
    { id: 'ytterbrygga-cargo', portId: 'ytterbrygga', name: 'Ytterbrygga T-head (cargo)', x: 4023.9, z: -5411.7, headingDeg: 145, shoreX: 0.819, shoreZ: -0.574, shoreDist: 2.5, deckY: 2.4 },
  ],
  slipways: [],
  lamps: [
    { x: 6625, z: -7624, y: 7.5 },
    { x: 6680, z: -7624, y: 7.5 },
    { x: 6664, z: -7326, y: 6 },
    { x: 4090, z: -5457, y: 7 },
    { x: 4036, z: -5419, y: 7 },
    { x: 5165, z: -7890, y: 4.5 },
  ],
  portFloods: [
    { portId: 'kvassvik', x: 6662, y: 11, z: -7630 },
    { portId: 'kvassfarm', x: 6662, y: 8, z: -7330 },
    { portId: 'ytterbrygga', x: 4032, y: 10, z: -5418 },
    { portId: 'trangvika', x: 5150, y: 6, z: -7888 },
  ],
  pottingGrounds: [
    { id: 'kvassnes', name: 'Kvassnes, under the light', x: 3660, z: -5790, radius: 50, quality: 0.8 },
    { id: 'ytter', name: 'Ytterbrygga rocks', x: 4040, z: -5560, radius: 50, quality: 0.75 },
  ],
  fishingGrounds: [
    { name: 'Ytre Banken', x: 3300, z: -6000, radius: 400, richness: 1.1, species: 'cod' },
    { name: 'Djupet', x: 4950, z: -6530, radius: 200, richness: 1.2, species: 'halibut' },
  ],
  fogBanks: [{ x: 3250, z: -5400, r: 350, visibility: 250 }],
  currents: [
    // Kvasstraumen: the race in the narrows, flooding into the fjord (045°), 8 kn at peak.
    { id: 'kvasstraumen', name: 'Kvasstraumen', x: 4225, z: -6025, length: 620, width: 260, setDeg: 45, peakKn: 8, periodH: 6, phaseH: 1.5, waveFactor: 1.7, knocks: 4 },
  ],
  jobs: {
    tows: [
      // A cage ring torn off the farm, drifting down the fjord.
      { kind: 'cage', weight: 1, name: 'a cage ring torn off the Kvass fish farm, drifting down the fjord', at: { x: 5900, z: -6800, r: 150 } },
      { kind: 'dory', weight: 0.8, name: 'a fishing boat with a fouled propeller off the fjord mouth', at: { x: 3450, z: -5550, r: 250 } },
      { kind: 'yacht', weight: 0.4 },
    ],
    rescues: [
      // A kayaker knocked over by a gust in Trangfjorden.
      { def: 'kayaker', weight: 1, at: { x: 5260, z: -7250, r: 100 } },
      { def: 'manOverboard', weight: 0.4 },
    ],
  },
  // Calmer than the Sounds: more clear days, less rain; inside the fjord the shelter does the
  // rest. Katabatic gusts off the mountains in light weather.
  weather: {
    next: {
      Clear: { Clear: 3, Overcast: 2, Fog: 1 },
      Overcast: { Clear: 2, Rain: 2, Fog: 1 },
      Fog: { Clear: 1, Overcast: 2 },
      Rain: { Overcast: 2, Squall: 1, Clear: 1 },
      Squall: { Rain: 1, Overcast: 2 },
    },
    hold: [500, 1200],
    katabatic: { every: [150, 420], last: [25, 60] },
  },
  theme: { grass: 0x4c7536, heath: 0x6a6d47, rock: 0x6b6c6c, heathAbove: 120, snowAbove: 480, treesTo: 230, treeSlope: 1.2 },
  falls: [
    // Trangvika: off the basin's west wall.
    { x: 4915, z: -7640, toX: 5003, toZ: -7640, width: 6 },
    // The gut: down its east wall.
    { x: 5410, z: -7180, toX: 5305, toZ: -7180, width: 5 },
    // Off Kvassdalen's north-west wall, above the village.
    { x: 6550, z: -7986, toX: 6717, toZ: -7875, width: 8 },
  ],
  // The farm: two rows of three cage rings along the fjord's south-east wall, off the village.
  farms: [{ name: 'Kvass fish farm', x: 6760, z: -7380, yawDeg: 225, rows: 2, cols: 3, spacing: 32, ringRadius: 12, port: 'kvassfarm' }],
  gusts: [
    // Down Trangfjorden from the north: the gut funnels it.
    { id: 'trang', name: 'Trangfjorden', x: 5240, z: -7200, r: 380, fromDeg: 355, peakMs: 20 },
    // Down the inner fjord from the north-east.
    { id: 'inner', name: 'inner Kvassfjorden', x: 5950, z: -6950, r: 500, fromDeg: 55, peakMs: 17 },
  ],
};
