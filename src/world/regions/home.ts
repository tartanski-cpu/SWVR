/**
 * Region `home`: the original archipelago, where every game starts. Workboat World v1.0's
 * whole world, unchanged (the regions brief: home stays exactly as it is; it only gains
 * neighbours). The numbers here are level data, not tunables.
 *
 *   Port types (owner brief):
 *     Selkie Bay, Rona       - anchorage only: a horseshoe bay opening north, beach at its head
 *     Brannock Pier          - a long T-headed pier into deep water off an open island; fuel
 *     Calder Haven, Calder   - narrow entrance between breakwaters into a sheltered, dredged
 *                              basin with a quay; fuel
 *
 * A new game starts in Calder Haven, the boat moored at the quay (CONFIG.start).
 */
import type { RegionDef } from '../defs';

// ── Calder Haven: a dredged basin cut into Calder's west shore, closed off by two
// breakwaters with a ~30 m entrance facing west. Quay along the basin's east side. ──
const CH = { x: 665, z: 650 };
const S2 = Math.SQRT1_2;

export const HOME: RegionDef = {
  id: 'home',
  name: 'Skerry Sound',
  // Everything of home's, with sea room round it: the fishing grounds and fog banks reach
  // furthest (Calder Bank east of Tarran, The Hollows west of Rona, the Skerry's fog).
  bounds: { x0: -1500, x1: 2100, z0: -700, z1: 1800 },
  landmarks: [
    // Calder Holm's summit (the island's `height`) and the Tarran light (its lamp height).
    { name: 'Calder Holm', kind: 'hill', x: 960, z: 650, height: 44 },
    { name: 'Tarran lighthouse', kind: 'lighthouse', x: 1400, z: -250, height: 26 },
  ],
  islands: [
    {
      name: 'Calder Holm',
      x: 960,
      z: 650,
      radius: 330,
      height: 44,
      shape: [
        [2, 0.06, 0.6],
        [3, 0.05, 2.1],
        [5, 0.03, 4.0],
      ],
      beach: 6,
      seed: 1,
      trees: 0.5,
    },
    {
      name: 'Brannock',
      x: -760,
      z: 520,
      radius: 170,
      height: 28,
      shape: [
        [2, 0.08, 1.4],
        [3, 0.05, 0.2],
      ],
      beach: 10,
      seed: 2,
      trees: 0.35,
    },
    {
      name: 'Rona',
      x: -150,
      z: 1380,
      radius: 240,
      height: 38,
      shape: [
        [2, 0.05, 2.5],
        [4, 0.04, 1.0],
      ],
      beach: 18,
      seed: 3,
      trees: 0.6,
    },
    { name: 'Gull Rocks', x: 370, z: 410, radius: 18, height: 7, shape: [[3, 0.15, 0.4]], beach: 1, seed: 4, trees: 0 },
    { name: 'Gull Rocks', x: 402, z: 442, radius: 12, height: 5, shape: [[2, 0.2, 1.1]], beach: 1, seed: 5, trees: 0 },
    { name: 'Gull Rocks', x: 352, z: 448, radius: 9, height: 4, shape: [[3, 0.2, 2.0]], beach: 1, seed: 6, trees: 0 },
    { name: 'Tarran', x: 1400, z: -250, radius: 70, height: 14, shape: [[2, 0.12, 0.3], [3, 0.08, 1.9]], beach: 3, seed: 7, trees: 0.15 },
    // Craig Bheag: a lone rock awash on the Calder - Selkie passage, an isolated danger mark on it.
    { name: 'Craig Bheag', x: 240, z: 880, radius: 7, height: 1.2, shape: [[3, 0.25, 0.7]], beach: 0.5, seed: 11, trees: 0 },
    { name: 'Skerry', x: -470, z: -360, radius: 28, height: 6, shape: [[2, 0.18, 0.9]], beach: 2, seed: 8, trees: 0 },
    {
      name: 'Eilean Dubh',
      x: 560,
      z: 1500,
      radius: 140,
      height: 24,
      shape: [
        [2, 0.1, 0.1],
        [3, 0.06, 2.7],
      ],
      beach: 8,
      seed: 9,
      trees: 0.45,
    },
  ],
  cuts: [
    // Calder Haven basin (dredged to 4.5 m).
    { x: CH.x, z: CH.z, radius: 80, depth: 4.5, edge: 14 },
    // Selkie Bay, Rona: natural bay opening north, ~9 m in the middle, shoaling to the beach.
    { x: -150, z: 1190, radius: 120, depth: 9, edge: 55 },
  ],
  flats: [
    // Calder Haven waterfront, level with the quay.
    { x: CH.x + 40, z: CH.z, radius: 150, height: 1.8, edge: 90 },
    // The boatyard by the slipway, levelled at the waterfront's height.
    { x: 758, z: 714, radius: 26, height: 1.8, edge: 18 },
    // Brannock pier root.
    { x: -665, z: 435, radius: 40, height: 2.0, edge: 40 },
    // Selkie Bay: a low beach and dune behind the bay head instead of a cut hillside.
    { x: -150, z: 1272, radius: 90, height: 1.4, edge: 70 },
  ],
  ridges: [
    // Hazards (owner request: real dangers, buoyed to IALA region A; see MARKS, WRECKS).
    // Dubh Sgeir: a drying reef across the Brannock - Selkie passage, rocks just awash.
    { ax: -290, az: 735, bx: -215, bz: 750, crest: 0.4, halfWidth: 4, slope: 0.35 },
    // The wreck of the coaster Margaret Ann, on her side across the Calder - Brannock track:
    // her hull stands to just above the water (drawn as the wreck, not as rubble).
    { ax: 30, az: 470, bx: 52, bz: 486, crest: 0.6, halfWidth: 3.5, slope: 0.6, drawn: false },
    // North breakwater: from the shore west, then hooking south to the entrance.
    { ax: 680, az: 560, bx: 600, bz: 585, crest: 3.2, halfWidth: 2.5, slope: 0.7 },
    { ax: 600, az: 585, bx: 578, bz: 628, crest: 3.2, halfWidth: 2.5, slope: 0.7 },
    // South breakwater: from the shore west, then hooking north; heads ~30 m apart.
    { ax: 680, az: 742, bx: 602, bz: 712, crest: 3.2, halfWidth: 2.5, slope: 0.7 },
    { ax: 602, az: 712, bx: 580, bz: 664, crest: 3.2, halfWidth: 2.5, slope: 0.7 },
  ],
  blocks: [
    // Calder Haven quay: 70 m wall along the basin's east side, facing west.
    // The apron runs back to the shore (x 711-751), so the quay is part of the land.
    { kind: 'quay', x: CH.x + 66, z: CH.z, halfLength: 35, halfWidth: 20, yawDeg: 0, top: 1.6, fendered: true },
    // Brannock Pier: 130 m out to the north-east, then a 50 m T-head (deck +2.2 m).
    { kind: 'pier', x: -604, z: 368, halfLength: 68, halfWidth: 3, yawDeg: 45, top: 2.2, fendered: false },
    { kind: 'pier', x: -553, z: 317, halfLength: 25, halfWidth: 5, yawDeg: 135, top: 2.2, fendered: true },
  ],
  buildings: [
    // Calder Haven waterfront.
    { x: 742, z: 622, width: 8, depth: 6, height: 3.5, yawDeg: 0, wall: 0xe8e2d0, roof: 0x8a3a2a, cladding: 'render' }, // harbour office (on the quay)
    { x: 762, z: 645, width: 16, depth: 11, height: 6, yawDeg: 0, wall: 0x9fa7ad, roof: 0x4d555b, cladding: 'sheet' }, // fish shed
    { x: 760, z: 676, width: 8, depth: 7, height: 4, yawDeg: 0, wall: 0xd9c9a3, roof: 0x5a3a2a, cladding: 'boards' },
    { x: 778, z: 602, width: 9, depth: 7, height: 4.5, yawDeg: 10, wall: 0xf1ede2, roof: 0x2f4f6f },
    { x: 784, z: 700, width: 9, depth: 8, height: 4.5, yawDeg: -8, wall: 0xe8d6b8, roof: 0x8a3a2a, cladding: 'boards' },
    { x: 805, z: 650, width: 12, depth: 8, height: 5, yawDeg: 4, wall: 0xf4f0e6, roof: 0x3e3e3e },
    // The boatyard shed by the slipway, its front (door and the yard's board) facing west
    // to the slip and the quay (CONFIG.boatyard).
    { x: 764, z: 708, width: 12, depth: 9, height: 5, yawDeg: 90, wall: 0x6f7f78, roof: 0x7a4a30, cladding: 'sheet' },
    // Brannock: shed and cottage at the pier root.
    { x: -680, z: 440, width: 14, depth: 9, height: 5, yawDeg: 45, wall: 0x8c9aa3, roof: 0x3e4a52, cladding: 'sheet' },
    { x: -705, z: 470, width: 8, depth: 6, height: 4, yawDeg: 30, wall: 0xf0ebe0, roof: 0x7a2e22, cladding: 'boards' },
    // Rona: a bothy above the beach at Selkie Bay.
    { x: -142, z: 1309, width: 6, depth: 5, height: 3, yawDeg: 5, wall: 0xd8d2c4, roof: 0x3a3a3a },
  ],
  yards: [
    {
      // The yard crane by the head of the slip, its jib out over it; two old boats laid up.
      crane: { x: 737, z: 710, jibDeg: 240 },
      boats: [
        { x: 747, z: 722, headingDeg: 195, length: 9, beam: 3.2, depth: 1.7, house: true },
        { x: 751, z: 697, headingDeg: 260, length: 7, beam: 2.6, depth: 1.3, house: false },
      ],
    },
  ],
  marks: [
    // The Margaret Ann wreck (x 30-52, z 470-486): pass north of the north mark or south of the south one.
    { name: 'Margaret Ann N', kind: 'N', x: 41, z: 420 },
    { name: 'Margaret Ann S', kind: 'S', x: 41, z: 536 },
    // Dubh Sgeir reef (x -290 to -215, z ~740): pass west of the west mark or east of the east one.
    { name: 'Dubh Sgeir W', kind: 'W', x: -345, z: 742 },
    { name: 'Dubh Sgeir E', kind: 'E', x: -160, z: 745 },
    // Craig Bheag: an isolated danger mark on the rock itself.
    { name: 'Craig Bheag', kind: 'isolated', x: 240, z: 880 },
    // Gull Rocks: west of them, and south (the Calder - Brannock track passes south).
    { name: 'Gull Rocks W', kind: 'W', x: 300, z: 430 },
    { name: 'Gull Rocks S', kind: 'S', x: 380, z: 500 },
    // The Skerry: west of it.
    { name: 'Skerry W', kind: 'W', x: -540, z: -360 },
    // Calder Haven approach, entering eastward: red to port (north), green to starboard (south).
    { name: 'Calder No 1', kind: 'stbd', x: 525, z: 670 },
    { name: 'Calder No 2', kind: 'port', x: 525, z: 622 },
  ],
  wrecks: [{ name: 'Margaret Ann', x: 41, z: 478, headingDeg: 54, length: 30, listDeg: 55 }],
  lights: [
    // Calder Haven entrance: IALA region A - red to port, green to starboard, entering.
    // Entering eastwards, the north head is on the port hand.
    { name: 'Calder N head Fl R 4s', x: 578, z: 628, y: 7, color: 'red', period: 4, tower: 'post' },
    { name: 'Calder S head Fl G 4s', x: 580, z: 664, y: 7, color: 'green', period: 4, tower: 'post' },
    { name: 'Brannock pier head F R', x: -553, z: 317, y: 6, color: 'red', period: 0, tower: 'post' },
    { name: 'Tarran Fl W 10s', x: 1400, z: -250, y: 26, color: 'white', period: 10, tower: 'lighthouse' },
  ],
  shelters: [
    { x: CH.x, z: CH.z, rIn: 55, rOut: 100, factor: 0.08 },
    { x: -150, z: 1230, rIn: 60, rOut: 180, factor: 0.4 },
  ],
  ports: [
    { id: 'calder', name: 'Calder Haven', kind: 'harbour', x: 570, z: 646, fuel: { x: 705, z: 625, radius: 14, pumpX: 713, pumpZ: 625 },
      clearRadius: 140,
      // Middle-south of the quay (the fuel berth is at its north end). The goods stack runs
      // north from (stackX, stackZ), 4 m in from the quay edge, abeam the aft deck of a boat
      // at the cargo berth (owner: it was 10 m forward of her, by her bow).
      cargo: { berth: { x: 707, z: 660, radius: 16 }, stackX: 714.8, stackZ: 666, stackYawDeg: 0, color: 0x2f6fd0 },
    },
    { id: 'brannock', name: 'Brannock Pier', kind: 'pier', x: -553, z: 317, fuel: { x: -545, z: 305, radius: 14, pumpX: -556.6, pumpZ: 309.3 }, // the pump abeam the fuel berth, within the hose's reach
      clearRadius: 70,
      // South-east end of the T-head's seaward face (fuel is at the north-west end).
      cargo: { berth: { x: -539, z: 321, radius: 14 }, stackX: -547, stackZ: 320, stackYawDeg: 135, color: 0xe07a1f },
    },
    {
      id: 'selkie',
      name: 'Selkie Bay (anchorage)',
      kind: 'anchorage',
      x: -150,
      z: 1150,
      clearRadius: 40,
      // Anchor in the bay; the goods wait on the beach by the bothy.
      cargo: { anchorage: { x: -150, z: 1190, radius: 110 }, stackX: -162, stackZ: 1301, stackYawDeg: 90, color: 0x2fa050 },
    },
  ],
  berths: [
    // Calder Haven quay, west face at x = 711: half beam 2.1 m + fenders.
    { id: 'calder-fuel', portId: 'calder', name: 'Calder Haven quay (fuel)', x: 708.5, z: 625, headingDeg: 0, shoreX: 1, shoreZ: 0, shoreDist: 2.5, deckY: 1.6 },
    { id: 'calder-cargo', portId: 'calder', name: 'Calder Haven quay (cargo)', x: 708.5, z: 660, headingDeg: 0, shoreX: 1, shoreZ: 0, shoreDist: 2.5, deckY: 1.6 },
    // Brannock T-head, seaward (NE) face; the T-head runs 135°/315°.
    { id: 'brannock-fuel', portId: 'brannock', name: 'Brannock T-head (fuel)', x: -553.4, z: 306.1, headingDeg: 135, shoreX: -S2, shoreZ: S2, shoreDist: 2.5, deckY: 2.2 },
    { id: 'brannock-cargo', portId: 'brannock', name: 'Brannock T-head (cargo)', x: -539.2, z: 320.2, headingDeg: 135, shoreX: -S2, shoreZ: S2, shoreDist: 2.5, deckY: 2.2 },
  ],
  slipways: [
    // Calder Haven: south of the quay's south end, up onto the waterfront (eastward).
    { id: 'calder-slip', portId: 'calder', name: 'Calder Haven slipway', x: 726, z: 700, headingDeg: 90, width: 6, length: 28, top: 1.8, slope: 1 / 8 },
    // Selkie Bay: up the beach at the bay head, west of the bothy, by the goods stack (southward).
    { id: 'selkie-slip', portId: 'selkie', name: 'Selkie Bay slipway', x: -168, z: 1296, headingDeg: 180, width: 6, length: 26, top: 1.5, slope: 1 / 8 },
  ],
  lamps: [
    // Calder Haven: along the back of the quay apron, and the waterfront.
    { x: 716, z: 618, y: 7.5 },
    { x: 716, z: 642, y: 7.5 },
    { x: 716, z: 668, y: 7.5 },
    { x: 735, z: 690, y: 7.5 },
    // Brannock: along the pier and on the T-head.
    { x: -640, z: 404, y: 7 },
    { x: -615, z: 379, y: 7 },
    { x: -590, z: 354, y: 7 },
    { x: -568, z: 329, y: 7 },
    { x: -562.2, z: 305, y: 7 },
    { x: -541, z: 326.2, y: 7 },
    // Selkie Bay: a single lamp at the bothy.
    { x: -150, z: 1305, y: 4.5 },
  ],
  portFloods: [
    { portId: 'calder', x: 712, y: 11, z: 645 },
    { portId: 'brannock', x: -552, y: 10, z: 316 },
    { portId: 'selkie', x: -150, y: 6, z: 1300 },
  ],
  pottingGrounds: [
    { id: 'gull', name: 'Gull Rocks, south side', x: 375, z: 482, radius: 55, quality: 0.8 },
    { id: 'skerry', name: 'the Skerry, east side', x: -435, z: -350, radius: 50, quality: 0.7 },
    { id: 'craig', name: 'Craig Bheag', x: 228, z: 895, radius: 45, quality: 0.9 },
    { id: 'tarran', name: 'Tarran north point', x: 1400, z: -335, radius: 60, quality: 0.75 },
  ],
  // Trawling grounds (fishing/fishing.ts): a circle and its richness.
  fishingGrounds: [
    { name: 'Calder Bank', x: 1700, z: 650, radius: 300, richness: 1.2 },
    { name: 'Skerry Ground', x: -150, z: -150, radius: 250, richness: 0.8 },
    { name: 'The Hollows', x: -1100, z: 1000, radius: 320, richness: 1.0 },
  ],
  // Fog banks (weather.ts visibilityAt): around Gull Rocks (between the start and Calder
  // Haven) and off the Skerry.
  fogBanks: [
    { x: 380, z: 430, r: 260, visibility: 160 },
    { x: -470, z: -360, r: 230, visibility: 180 },
  ],
};
