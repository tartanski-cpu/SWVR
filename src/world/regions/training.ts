/**
 * Region `training`, the training harbour (docs/TRAINING.md section 4): Training mode's whole
 * world, a small walled harbour built for the exercises and nothing else. No town, no harbour
 * boats, no traffic, no jobs. The numbers here are level data, not tunables; what each
 * exercise asks of a place (which berth, which marks) is in src/training/exercises.ts.
 *
 * The harbour is cut into the north shore of Harbour Head and closed by a breakwater with a
 * 56 m entrance facing north. Inside, from west to east along the quay (its face at z 200,
 * looking north), sized for the fishing boat (9.75 m by 4.6 m):
 *
 *   the slot      a berth between two short jetties, about 6 m clear at each end: leaving
 *                 ahead and astern (exercise H10)
 *   berths A-C    plain berths along the fendered quay: coming alongside (H8), the start
 *   the dock      a three-sided walled basin 30 m across (three of her lengths), open to
 *                 the north: turning in a confined space (H6)
 *
 * and out in the middle of the harbour the stopping lane, 280 m long and 30 m wide between
 * four yellow special marks (H5). The water is 6 m deep throughout: a bank (`shoals`) under
 * the whole harbour keeps the breakwater's rubble from spreading into it from deep water.
 *
 * Outside (Coast practice, M4): the approach from the north-east past a wreck with its four
 * cardinal marks and a rock with an isolated-danger mark (C5, C7); two fixed white leading
 * lights behind the quay on a line due south through the entrance (C2); the Harbour Head
 * lighthouse on the head's west side, to take bearings of (C3); eight fast slalom marks in a
 * line west of the harbour (C4); and off the head's west side a tidal stream between two
 * marks (C6).
 *
 * World axes: +X east, -Z north, metres.
 */
import type { RegionDef } from '../defs';

/** The quay face's line (z, m): boats alongside lie 2.5 m north of it. */
const FACE = 200;
const ALONG = FACE - 2.5;

export const TRAINING: RegionDef = {
  id: 'training',
  name: 'Training harbour',
  bounds: { x0: -1100, x1: 1100, z0: -1150, z1: 1100 },
  landmarks: [{ name: 'Harbour Head', kind: 'hill', x: 0, z: 600, height: 30 }],
  islands: [
    {
      name: 'Harbour Head',
      x: 0,
      z: 600,
      radius: 450,
      height: 30,
      shape: [
        [2, 0.04, 0.8],
        [3, 0.03, 2.2],
      ],
      beach: 6,
      seed: 41,
      trees: 0.12,
    },
  ],
  // The bank the harbour lies on: 6 m of water, falling away to the open sea's depth beyond.
  shoals: [{ x: 0, z: 0, radius: 520, depth: 6, edge: 220 }],
  cuts: [
    // The basin, dredged into the head's shore to the same 6 m.
    { x: 0, z: 100, radius: 170, depth: 6, edge: 15 },
  ],
  flats: [
    // The waterfront behind the quay, level with it.
    { x: 0, z: 265, radius: 230, height: 1.8, edge: 80 },
  ],
  ridges: [
    // The breakwater: up each side from the shore, then in to the entrance from either hand.
    { ax: -200, az: 200, bx: -200, bz: -60, crest: 3.2, halfWidth: 2.5, slope: 0.7 },
    { ax: -200, az: -60, bx: -28, bz: -80, crest: 3.2, halfWidth: 2.5, slope: 0.7 },
    { ax: 200, az: 200, bx: 200, bz: -60, crest: 3.2, halfWidth: 2.5, slope: 0.7 },
    { ax: 200, az: -60, bx: 28, bz: -80, crest: 3.2, halfWidth: 2.5, slope: 0.7 },
    // The rock under the isolated-danger mark (C5), awash.
    { ax: 196, az: -330, bx: 204, bz: -330, crest: 0.4, halfWidth: 3, slope: 0.6 },
    // The wreck of the Kittiwake (C5): her hull, drawn as a wreck (`wrecks`).
    { ax: 368, az: -513, bx: 392, bz: -527, crest: 0.6, halfWidth: 3.5, slope: 0.6, drawn: false },
  ],
  blocks: [
    // The quay: 260 m of fendered wall facing north, its apron running back to the land.
    { kind: 'quay', x: 0, z: FACE + 40, halfLength: 130, halfWidth: 40, yawDeg: 90, top: 1.6, fendered: true },
    // The slot's two short jetties, 8 m out from the face, 25 m apart (centre to centre).
    { kind: 'pier', x: -117.5, z: FACE - 4, halfLength: 4, halfWidth: 1.5, yawDeg: 0, top: 1.6, fendered: true },
    { kind: 'pier', x: -92.5, z: FACE - 4, halfLength: 4, halfWidth: 1.5, yawDeg: 0, top: 1.6, fendered: true },
    // The dock's two side walls (quay walls, as the quay), 32 m out from the face, 30 m clear between them.
    { kind: 'quay', x: 60, z: FACE - 16, halfLength: 16, halfWidth: 2.5, yawDeg: 0, top: 1.6, fendered: true },
    { kind: 'quay', x: 95, z: FACE - 16, halfLength: 16, halfWidth: 2.5, yawDeg: 0, top: 1.6, fendered: true },
  ],
  buildings: [
    // The training office (the review board will hang on it: M2) and a store shed.
    { x: -40, z: 228, width: 10, depth: 7, height: 3.5, yawDeg: 0, wall: 0xe8e2d0, roof: 0x2f4f6f, cladding: 'render' },
    { x: 30, z: 240, width: 16, depth: 10, height: 5.5, yawDeg: 0, wall: 0x9fa7ad, roof: 0x4d555b, cladding: 'sheet' },
  ],
  marks: [
    // The approach, entering southward: red to port (east), green to starboard (west).
    { name: 'Training No 1', kind: 'stbd', x: -25, z: -140 },
    { name: 'Training No 2', kind: 'port', x: 25, z: -140 },
    // The stopping lane's corners (H5): yellow special marks, the lane between them.
    { name: 'Lane NW', kind: 'special', x: -140, z: 40 },
    { name: 'Lane SW', kind: 'special', x: -140, z: 70 },
    { name: 'Lane NE', kind: 'special', x: 140, z: 40 },
    { name: 'Lane SE', kind: 'special', x: 140, z: 70 },
    // The low-speed slalom (H13): six yellow marks in a line east-west, 50 m apart.
    ...[-125, -75, -25, 25, 75, 125].map((x, i) => ({ name: `Slalom ${i + 1}`, kind: 'special' as const, x, z: 120 })),
    // Holding off (H7): one yellow mark in open water inside the breakwater.
    { name: 'Hold-off mark', kind: 'special', x: 100, z: -10 },
    // Picking up a mooring (H15): an orange pick-up buoy.
    { name: 'The mooring', kind: 'mooring', x: -100, z: -10 },
    // Search and recover (R7): the datum, outside to the north-west, where the casualty was last seen.
    { name: 'Datum', kind: 'special', x: -220, z: -460 },
    // The Kittiwake's cardinals (C5, C7), 70 m off her: pass on the side each names.
    { name: 'Kittiwake N', kind: 'N', x: 380, z: -590 },
    { name: 'Kittiwake E', kind: 'E', x: 450, z: -520 },
    { name: 'Kittiwake S', kind: 'S', x: 380, z: -450 },
    { name: 'Kittiwake W', kind: 'W', x: 310, z: -520 },
    // The rock (C5, C7): an isolated danger, clear water all round it.
    { name: 'Gull Rock', kind: 'isolated', x: 200, z: -330 },
    // The fast slalom (C4): eight yellow marks north-south, 100 m apart, west of the harbour.
    ...Array.from({ length: 8 }, (_, i) => ({ name: `Fast slalom ${i + 1}`, kind: 'special' as const, x: -650, z: -250 - i * 100 })),
    // The stream's crossing (C6): one mark each side of it.
    { name: 'Race W', kind: 'special', x: -750, z: 150 },
    { name: 'Race E', kind: 'special', x: -450, z: 150 },
  ],
  wrecks: [{ name: 'Kittiwake', x: 380, z: -520, headingDeg: 120, length: 28, listDeg: 40 }],
  lights: [
    { name: 'Training E head Fl R 4s', x: 28, z: -80, y: 7, color: 'red', period: 4, tower: 'post' },
    { name: 'Training W head Fl G 4s', x: -28, z: -80, y: 7, color: 'green', period: 4, tower: 'post' },
    // The leading lights (C2, C7): fixed white, the rear higher, in line on 180° through the entrance.
    { name: 'Training front leading light F W', x: 0, z: 255, y: 9, color: 'white', period: 0, tower: 'post' },
    { name: 'Training rear leading light F W', x: 0, z: 335, y: 17, color: 'white', period: 0, tower: 'post' },
    // Harbour Head lighthouse, on the head's west side (C3's bearings).
    { name: 'Harbour Head Fl W 10s', x: -300, z: 360, y: 32, color: 'white', period: 10, tower: 'lighthouse' },
  ],
  shelters: [{ x: 0, z: 70, rIn: 170, rOut: 240, factor: 0.08 }],
  ports: [
    {
      id: 'training',
      name: 'Training harbour',
      kind: 'harbour',
      x: 0,
      z: -110,
      fuel: { x: -60, z: ALONG, radius: 14, pumpX: -60, pumpZ: FACE + 2 },
      clearRadius: 260,
      cargo: { berth: { x: 10, z: ALONG, radius: 14 }, stackX: 10, stackZ: FACE + 6, stackYawDeg: 90, color: 0xd0a02f },
      economy: { repairs: false },
    },
    // Anchoring (H11): three anchorages outside the breakwater, each its own bottom (CONFIG.anchoring.bottomHolding).
    ...([['sand', -250, -230], ['mud', 0, -290], ['weed', 250, -230]] as const).map(([bottom, x, z]) => ({
      id: `training-${bottom}`,
      name: `The ${bottom} anchorage`,
      kind: 'anchorage' as const,
      x,
      z,
      clearRadius: 0,
      bottom,
      cargo: { anchorage: { x, z, radius: 50 }, stackX: -100, stackZ: FACE + 8, stackYawDeg: 90, color: 0x8a8a8a },
    })),
  ],
  berths: [
    // Along the quay face, lying east-west; the quay to the south of her.
    { id: 'training-slot', portId: 'training', name: 'The slot', x: -105, z: ALONG, headingDeg: 90, shoreX: 0, shoreZ: 1, shoreDist: 2.5, deckY: 1.6 },
    { id: 'training-a', portId: 'training', name: 'Berth A (fuel)', x: -60, z: ALONG, headingDeg: 90, shoreX: 0, shoreZ: 1, shoreDist: 2.5, deckY: 1.6 },
    { id: 'training-b', portId: 'training', name: 'Berth B', x: -25, z: ALONG, headingDeg: 90, shoreX: 0, shoreZ: 1, shoreDist: 2.5, deckY: 1.6 },
    { id: 'training-c', portId: 'training', name: 'Berth C', x: 10, z: ALONG, headingDeg: 90, shoreX: 0, shoreZ: 1, shoreDist: 2.5, deckY: 1.6 },
  ],
  slipways: [],
  lamps: [
    { x: -105, z: FACE + 8, y: 7.5 },
    { x: -45, z: FACE + 8, y: 7.5 },
    { x: 15, z: FACE + 8, y: 7.5 },
    { x: 78, z: FACE + 8, y: 7.5 },
  ],
  portFloods: [{ portId: 'training', x: 0, y: 11, z: FACE + 6 }],
  pottingGrounds: [],
  fishingGrounds: [],
  fogBanks: [],
  // The stream off the head's west side (C6): north-going, 2.5 kn at its height. Training holds
  // it at slack except while C6 runs (training.ts; EnvironmentState.raceOverride).
  currents: [{ id: 'training-stream', name: 'Head Stream', x: -600, z: 150, length: 320, width: 200, setDeg: 0, peakKn: 2.5, periodH: 6, phaseH: 0, waveFactor: 1, knocks: 0 }],
  // Fair weather that stays fair: an exercise sets its own wind and sky.
  weather: {
    next: { Clear: { Clear: 1 }, Overcast: { Clear: 1 }, Fog: { Clear: 1 }, Rain: { Clear: 1 }, Squall: { Clear: 1 } },
    hold: [3600, 7200],
  },
};
