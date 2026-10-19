/**
 * Region `narrows`, "The Narrows" (the regions brief, region 3: Alaskan / British
 * Columbian). Steep forested islands, grey rock, cold clear water, a cannery town. Original
 * places; the names are the game's own placeholders the owner may rename.
 *
 * Where: one gap out beyond the Sounds, to the north-west, across about 3.4 km of open water
 * from Tarsk. Two islands, Hemlock (west) and Kestrel (east), with Cutter Narrows between
 * them running north and south; shallow flats west of Hemlock with Spruce Channel buoyed
 * through them. Both ways lead north to the cannery.
 *
 * The spine:
 *   Ashby Cannery (harbour)  on Hemlock's north shore at the narrows' north exit, behind a
 *                            breakwater: fuel, and a buyer who pays the best price in the
 *                            islands for fish (the reason to go)
 *   Kestrel Wharf (pier)     a pier on Kestrel's south shore, the outside, facing the
 *                            prevailing south-westerly: no shelter
 *   Otter Cove (anchorage)   a cove in Hemlock's south shore behind Otter Islet, weed bottom
 * Character: Cutter Narrows, the strongest race in the game (12 kn at peak), with Twin Fang
 * Rock, a twin pinnacle 0.6 m under the surface in mid-channel, charted and marked: a boat
 * swept onto it grounds. Spruce Channel, the long way round: a dog-leg through flats a metre
 * deep, red buoys to port and green to starboard going in from the sea, two wrecks on the
 * flats beside it with cardinal marks. Leave the channel and you ground. Signal Peak, the
 * landmark: a radio mast with a red light on Hemlock's summit. Cutter Point lighthouse at the
 * narrows' south entrance. Fish: salmon outside, halibut in the deep north of the narrows;
 * crab round Kestrel. Goods: canned fish out, groceries and fuel drums in. Weather: cloud and
 * rain, fog in the mornings, calm water on the flats.
 */
import type { RegionDef } from '../defs';

/** Signal Peak: Hemlock's summit (the highest ground), and the mast's light 40 m up (CONFIG.regions.mastHeight). */
const PEAK = { x: -5160, z: -6310, h: 312.6 };

export const NARROWS: RegionDef = {
  id: 'narrows',
  name: 'The Narrows',
  bounds: { x0: -7800, x1: -2100, z0: -8800, z1: -4300 },
  landmarks: [
    { name: 'Signal Peak', kind: 'mast', x: PEAK.x, z: PEAK.z, height: PEAK.h + 40 },
    { name: 'Cutter Point lighthouse', kind: 'lighthouse', x: -3900, z: -5800, height: 30 },
  ],
  islands: [
    // The two islands the narrows run between: steep, forested, grey rock on the heights.
    { name: 'Hemlock Island', x: -5200, z: -6400, radius: 1100, height: 330, shape: [[2, 0.08, 0.3], [3, 0.05, 1.9], [5, 0.03, 0.7]], beach: 2, seed: 61, trees: 0.05, rise: 0.4 },
    { name: 'Kestrel Island', x: -3300, z: -6500, radius: 900, height: 250, shape: [[2, 0.1, 2.1], [3, 0.05, 0.6]], beach: 2, seed: 62, trees: 0.05, rise: 0.45 },
    // Otter Islet: the anchorage's shelter, in the mouth of the cove.
    { name: 'Otter Islet', x: -5000, z: -5180, radius: 60, height: 18, shape: [[3, 0.15, 0.9]], beach: 2, seed: 63, trees: 0.04 },
  ],
  // Lean terrain from just above the waterline (and the flats' floor), as the Fjord.
  leanTerrain: { above: 0.5, cells: 6 },
  channels: [
    // Cutter Narrows: about 480 m wide between walls of 200 m and more, 1.5 km long.
    { name: 'Cutter Narrows', points: [[-4300, -4900, 350], [-4250, -5700, 220], [-4250, -6400, 200], [-4250, -7100, 210], [-4300, -7900, 350]], depth: 38, edge: 110 },
    // Spruce Channel: 9 m deep, about 80 m wide, through the flats in seven legs.
    { name: 'Spruce Channel', points: [[-6500, -5000, 35], [-6550, -5800, 35], [-6800, -6300, 35], [-6750, -6900, 35], [-6450, -7400, 35], [-5900, -7700, 35], [-5300, -7750, 35], [-4800, -7550, 40]], depth: 9, edge: 25 },
  ],
  // The flats: a metre of water west and north of Hemlock.
  shoals: [
    { x: -6600, z: -5700, radius: 600, depth: 1.0, edge: 250 },
    { x: -6700, z: -6500, radius: 600, depth: 1.0, edge: 250 },
    { x: -6600, z: -7300, radius: 600, depth: 1.0, edge: 250 },
    { x: -6000, z: -7800, radius: 600, depth: 1.0, edge: 250 },
    { x: -5300, z: -7950, radius: 500, depth: 1.0, edge: 250 },
    { x: -5700, z: -7500, radius: 450, depth: 1.0, edge: 200 },
    { x: -6350, z: -7050, radius: 400, depth: 1.0, edge: 200 },
    { x: -5050, z: -7650, radius: 300, depth: 1.0, edge: 150 },
    { x: -6850, z: -6100, radius: 400, depth: 1.0, edge: 200 },
    // Filling between the banks and the island's shore, so the channel is the only deep way.
    { x: -6950, z: -6900, radius: 350, depth: 1.0, edge: 150 },
    { x: -6100, z: -7350, radius: 260, depth: 1.0, edge: 120 },
    { x: -5250, z: -7560, radius: 280, depth: 1.0, edge: 130 },
    { x: -5060, z: -7470, radius: 200, depth: 1.0, edge: 100 },
    { x: -6420, z: -6120, radius: 200, depth: 1.0, edge: 100 },
    { x: -4980, z: -7860, radius: 200, depth: 1.0, edge: 100 },
  ],
  cuts: [
    // Otter Cove: 9 m, cut into Hemlock's south shore behind the islet.
    { x: -5000, z: -5400, radius: 140, depth: 9, edge: 60 },
  ],
  flats: [
    // The cannery's ground behind the quay.
    { x: -4730, z: -7350, radius: 60, height: 2.0, edge: 30 },
    // Kestrel Wharf's root.
    { x: -3478, z: -5530, radius: 30, height: 2.4, edge: 15 },
    // Otter Cove: a landing at the head of the cove (outside the cove's cut: a flat inside a
    // cut's edge is dug down with it).
    { x: -5000, z: -5570, radius: 50, height: 1.5, edge: 30 },
  ],
  ridges: [
    // The cannery's breakwater, off its east side against the narrows.
    { ax: -4590, az: -7335, bx: -4650, bz: -7450, crest: 3, halfWidth: 4, slope: 0.6 },
    // Twin Fang Rock: two pinnacles 0.6 m under the surface in mid-narrows (not drawn: under water).
    { ax: -4234, az: -6420, bx: -4226, bz: -6420, crest: -0.6, halfWidth: 3, slope: 0.9, drawn: false },
    { ax: -4294, az: -6350, bx: -4286, bz: -6350, crest: -0.6, halfWidth: 3, slope: 0.9, drawn: false },
    // The wrecks' hulls (drawn as wrecks).
    { ax: -6546, az: -7105, bx: -6534, bz: -7123, crest: 0.5, halfWidth: 3, slope: 0.7, drawn: false },
    { ax: -5621, az: -7801, bx: -5591, bz: -7799, crest: 0.5, halfWidth: 3.5, slope: 0.7, drawn: false },
  ],
  blocks: [
    // Ashby Cannery quay: 80 m along the shore (108°), its face north-north-east.
    { kind: 'quay', x: -4718, z: -7386, halfLength: 40, halfWidth: 9, yawDeg: 108, top: 1.8, fendered: true },
    // Kestrel Wharf: 100 m out to the south-south-west, then a 32 m T-head.
    { kind: 'pier', x: -3497, z: -5478, halfLength: 50, halfWidth: 3, yawDeg: 200, top: 2.4, fendered: false },
    { kind: 'pier', x: -3515.4, z: -5427.2, halfLength: 16, halfWidth: 5, yawDeg: 110, top: 2.4, fendered: true },
  ],
  buildings: [
    // Ashby: the cannery (a long shed), its warehouse and office, the town up the slope behind.
    { x: -4722, z: -7362, width: 30, depth: 13, height: 8, yawDeg: 108, wall: 0x8a9496, roof: 0x5a2a22, cladding: 'sheet' },
    { x: -4686, z: -7350, width: 14, depth: 10, height: 6, yawDeg: 108, wall: 0x7a3a2a, roof: 0x3a3a3a, cladding: 'boards' },
    { x: -4752, z: -7348, width: 7, depth: 6, height: 3.5, yawDeg: 108, wall: 0xe8e4da, roof: 0x3a3a3a, cladding: 'boards' },
    { x: -4780, z: -7322, width: 8, depth: 7, height: 4, yawDeg: 100, wall: 0x6a8a9a, roof: 0x2e2e2e, cladding: 'boards' },
    { x: -4745, z: -7312, width: 8, depth: 7, height: 4, yawDeg: 115, wall: 0xd8d0b8, roof: 0x3a3a3a, cladding: 'boards' },
    { x: -4705, z: -7316, width: 9, depth: 7, height: 4.5, yawDeg: 108, wall: 0x9a3a2a, roof: 0x2e2e2e, cladding: 'boards' },
    { x: -4668, z: -7306, width: 8, depth: 6, height: 4, yawDeg: 100, wall: 0xeeeae2, roof: 0x3a3a3a, cladding: 'boards' },
    // Kestrel Wharf: a shed at the root.
    { x: -3470, z: -5545, width: 9, depth: 6, height: 4, yawDeg: 200, wall: 0x8c9aa3, roof: 0x3e4a52, cladding: 'sheet' },
    // Otter Cove: a trapper's cabin at the landing.
    { x: -5000, z: -5585, width: 5, depth: 4, height: 2.8, yawDeg: 0, wall: 0x6a4a32, roof: 0x3a3a3a, cladding: 'boards' },
  ],
  marks: [
    // Twin Fang Rock: an isolated danger mark on the southern pinnacle.
    { name: 'Twin Fang Rock', kind: 'isolated', x: -4230, z: -6420 },
    // Spruce Channel, entering from the sea (south): red to port, green to starboard.
    { name: 'Spruce No 2', kind: 'port', x: -6532, z: -5132 },
    { name: 'Spruce No 1', kind: 'stbd', x: -6501, z: -5401 },
    { name: 'Spruce No 4', kind: 'port', x: -6566, z: -5665 },
    { name: 'Spruce No 3', kind: 'stbd', x: -6591, z: -5936 },
    { name: 'Spruce No 6', kind: 'port', x: -6759, z: -6164 },
    { name: 'Spruce No 5', kind: 'stbd', x: -6764, z: -6448 },
    { name: 'Spruce No 8', kind: 'port', x: -6786, z: -6752 },
    { name: 'Spruce No 7', kind: 'stbd', x: -6654, z: -7013 },
    { name: 'Spruce No 10', kind: 'port', x: -6546, z: -7287 },
    { name: 'Spruce No 9', kind: 'stbd', x: -6301, z: -7454 },
    { name: 'Spruce No 12', kind: 'port', x: -6049, z: -7646 },
    { name: 'Spruce No 11', kind: 'stbd', x: -5748, z: -7689 },
    { name: 'Spruce No 14', kind: 'port', x: -5452, z: -7761 },
    { name: 'Spruce No 13', kind: 'stbd', x: -5184, z: -7678 },
    { name: 'Spruce No 16', kind: 'port', x: -4916, z: -7622 },
    // The wrecks: pass west of the Kittiwake, south of the Mary Dunn.
    { name: 'Kittiwake W', kind: 'W', x: -6583, z: -7140 },
    { name: 'Mary Dunn S', kind: 'S', x: -5602, z: -7745 },
  ],
  wrecks: [
    { name: 'Kittiwake', x: -6540, z: -7114, headingDeg: 31, length: 22, listDeg: 25 },
    { name: 'Mary Dunn', x: -5606, z: -7800, headingDeg: 85, length: 30, listDeg: -30 },
  ],
  lights: [
    // Signal Peak: the mast's red light (aircraft and ships), seen from the Sounds.
    { name: 'Signal Peak mast F R', x: PEAK.x, z: PEAK.z, y: PEAK.h + 40, color: 'red', period: 0, tower: 'none' },
    // Cutter Point: the lighthouse on Kestrel's south-west point, at the narrows' south entrance.
    { name: 'Cutter Point Fl W 5s', x: -3900, z: -5800, y: 30, color: 'white', period: 5, tower: 'lighthouse' },
    { name: 'Ashby breakwater Fl R 3s', x: -4650, z: -7450, y: 7, color: 'red', period: 3, tower: 'post' },
    { name: 'Ashby quay F G', x: -4683, z: -7383, y: 6, color: 'green', period: 0, tower: 'post' },
    { name: 'Kestrel Wharf F R', x: -3515, z: -5427, y: 6, color: 'red', period: 0, tower: 'post' },
  ],
  shelters: [
    // The cannery: behind the breakwater; open only to the north-west, over the flats.
    { x: -4710, z: -7400, rIn: 90, rOut: 200, factor: 0.15, openFromDeg: 315, openArcDeg: 25 },
    // Otter Cove: shut in by the islet; open a little to the south past it.
    { x: -5000, z: -5420, rIn: 90, rOut: 200, factor: 0.15, openFromDeg: 180, openArcDeg: 20 },
    // The flats: a metre of water breaks the sea; calm inside.
    { x: -6500, z: -6700, rIn: 500, rOut: 900, factor: 0.4 },
  ],
  ports: [
    {
      id: 'ashby',
      name: 'Ashby Cannery',
      kind: 'harbour',
      x: -4720,
      z: -7480,
      fuel: { x: -4731.6, z: -7402.5, radius: 14, pumpX: -4733.3, pumpZ: -7397.3 },
      clearRadius: 150,
      cargo: { berth: { x: -4697.3, z: -7391.4, radius: 16 }, stackX: -4701.2, stackZ: -7385.8, stackYawDeg: 108, color: 0xd0d0d0 },
      economy: {
        // The reason to go: the cannery's buyer pays the best price in the islands for fish,
        // and well for crab. Canned fish out; fuel drums and groceries in.
        buys: { fish: 1.6, shellfish: 1.4 },
        repairs: false,
        products: ['Canned fish'],
        needs: ['Oil drum', 'Groceries'],
      },
    },
    {
      id: 'kestrel',
      name: 'Kestrel Wharf',
      kind: 'pier',
      x: -3515,
      z: -5427,
      clearRadius: 70,
      // The goods on the T-head, along it from its middle. The steamer lands the islands'
      // groceries and fuel here, on the outside.
      cargo: { berth: { x: -3518, z: -5420, radius: 14 }, stackX: -3515.9, stackZ: -5425.8, stackYawDeg: 110, color: 0x303030 },
      economy: { repairs: false, products: ['Groceries', 'Oil drum'], needs: ['Crate'] },
    },
    {
      id: 'otter',
      name: 'Otter Cove (anchorage)',
      kind: 'anchorage',
      x: -5000,
      z: -5420,
      clearRadius: 50,
      cargo: { anchorage: { x: -5000, z: -5420, radius: 90 }, stackX: -4985, stackZ: -5572, stackYawDeg: 90, color: 0x8aa020 },
      bottom: 'weed',
      economy: { repairs: false, needs: ['Groceries'] },
    },
  ],
  berths: [
    // Ashby quay, north-north-east face: the boat lies along 108°/288°, the quay to her south-south-west.
    { id: 'ashby-fuel', portId: 'ashby', name: 'Ashby quay (fuel)', x: -4731.6, z: -7402.5, headingDeg: 108, shoreX: -0.309, shoreZ: 0.951, shoreDist: 2.5, deckY: 1.8 },
    { id: 'ashby-cargo', portId: 'ashby', name: 'Ashby quay (cargo)', x: -4697.3, z: -7391.4, headingDeg: 108, shoreX: -0.309, shoreZ: 0.951, shoreDist: 2.5, deckY: 1.8 },
    // Kestrel Wharf T-head, seaward (SSW) face; the T-head runs 110°/290°.
    { id: 'kestrel-cargo', portId: 'kestrel', name: 'Kestrel Wharf T-head (cargo)', x: -3518, z: -5420.2, headingDeg: 110, shoreX: 0.342, shoreZ: -0.94, shoreDist: 2.5, deckY: 2.4 },
  ],
  slipways: [],
  lamps: [
    { x: -4740, z: -7380, y: 7.5 },
    { x: -4700, z: -7368, y: 7.5 },
    { x: -3490, z: -5490, y: 7 },
    { x: -3512, z: -5432, y: 7 },
    { x: -4990, z: -5578, y: 4.5 },
  ],
  portFloods: [
    { portId: 'ashby', x: -4718, y: 11, z: -7380 },
    { portId: 'kestrel', x: -3514, y: 10, z: -5430 },
    { portId: 'otter', x: -5000, y: 6, z: -5575 },
  ],
  pottingGrounds: [
    { id: 'kestrel-east', name: 'Kestrel Island, east shore', x: -2395, z: -6450, radius: 50, quality: 0.85 },
    { id: 'otter-islet', name: 'Otter Islet', x: -5065, z: -5170, radius: 35, quality: 0.8 },
  ],
  fishingGrounds: [
    { name: 'Cutter Bank', x: -4300, z: -4700, radius: 400, richness: 1.2, species: 'salmon' },
    { name: 'Halibut Hole', x: -4300, z: -8250, radius: 300, richness: 1.2, species: 'halibut' },
  ],
  fogBanks: [{ x: -6600, z: -6800, r: 450, visibility: 300 }],
  currents: [
    // Cutter Narrows: the strongest race in the game, flooding north, 12 kn at peak; slack
    // at 00:45, 03:45 and so on (three-quarters of an hour after the Sounds' races).
    { id: 'cutter-narrows', name: 'Cutter Narrows', x: -4250, z: -6400, length: 1500, width: 480, setDeg: 0, peakKn: 12, periodH: 6, phaseH: 0.75, waveFactor: 2.0, knocks: 5 },
  ],
  jobs: {
    tows: [
      // A section of log boom broken loose, drifting toward the narrows.
      { kind: 'logRaft', weight: 1, name: 'a section of log boom broken loose south of Cutter Narrows', at: { x: -4250, z: -5300, r: 150 } },
      { kind: 'dory', weight: 0.7, name: 'a gillnetter with a dead engine off Kestrel Wharf', at: { x: -3500, z: -5000, r: 200 } },
      { kind: 'yacht', weight: 0.5, name: 'a yacht lost in the fog off Spruce Channel', at: { x: -6500, z: -4800, r: 150 } },
    ],
    rescues: [
      { def: 'kayaker', weight: 0.6, at: { x: -5000, z: -5150, r: 150 } },
      { def: 'manOverboard', weight: 0.5 },
      { def: 'lostCargo', weight: 0.4 },
    ],
  },
  // Cloud and rain, fog in the mornings; never clear straight to a squall.
  weather: {
    next: {
      Clear: { Overcast: 3, Clear: 1, Fog: 1 },
      Overcast: { Rain: 3, Overcast: 2, Fog: 1, Clear: 1 },
      Fog: { Overcast: 2, Rain: 1 },
      Rain: { Overcast: 2, Rain: 2, Squall: 1 },
      Squall: { Rain: 2, Overcast: 1 },
    },
    hold: [500, 1100],
    morningFog: { from: 5, to: 10, chance: 0.6 },
  },
  theme: { grass: 0x3d6b36, heath: 0x4f5c3a, rock: 0x686c6e, heathAbove: 160, treesTo: 280, treeSlope: 0.95 },
};
