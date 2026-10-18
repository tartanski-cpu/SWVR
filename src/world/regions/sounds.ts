/**
 * Region `sounds`, "The Sounds" (the regions brief, region 1: Hebridean; higher and harder
 * than home: cliffs, sea lochs, skerries, heather, dark water; a tall hill with a cairn as
 * the landmark).
 *
 * MILESTONE 2 STUB: only the landmark hill, so the crossing and the far view can be tried:
 * from home, on a clear day, the hill shows across the sound to the north; sail toward it
 * and the region's full terrain loads before you get there. Its harbours, races, grounds and
 * everything else come with milestone 4, when the owner has named the places (the names here
 * are placeholders). No ports yet, so no jobs or cargo come from here.
 *
 * Where: north of home (-Z), the gap from home's northern islands (Tarran, the Skerry) to
 * this island's south shore about 3.3 km, the brief's "one map diagonal".
 *
 * MILESTONE 3: the trial race, Sruth Tarsk, lies in the sound on the direct line from Calder
 * Haven to the hill: 500 m wide, 900 m long, running north on the flood and south on the
 * ebb at 9 kn at peak (the Corryvreckan-type race of the brief), a six-hour cycle with slack
 * at 00:00, 03:00, 06:00... The starter workboat (13 kn) makes about 4 kn over the ground
 * against it at peak; a Shipyard pilot boat punches through. Go round it to the east or west.
 */
import type { RegionDef } from '../defs';

export const SOUNDS: RegionDef = {
  id: 'sounds',
  name: 'The Sounds',
  // The footprint reaches south over the sound, to take in the trial race on the crossing.
  bounds: { x0: -1500, x1: 2500, z0: -6500, z1: -1900 },
  landmarks: [
    // The cairn hill: 150 m, steep, bare above the heather line.
    { name: 'Cnoc Tarsk', kind: 'hill', x: 400, z: -4000, height: 150 },
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
  ],
  // A big, high island: inland above 25 m the terrain is drawn in 18 m cells (3 x 3 of the
  // usual), the coast and shallows at the usual 6 m. Keeps her within the Quest's budget.
  leanTerrain: { above: 25, cells: 3 },
  cuts: [],
  flats: [],
  ridges: [],
  blocks: [],
  buildings: [],
  marks: [],
  wrecks: [],
  lights: [],
  shelters: [],
  ports: [],
  berths: [],
  slipways: [],
  lamps: [],
  portFloods: [],
  pottingGrounds: [],
  fishingGrounds: [],
  fogBanks: [],
  currents: [
    { id: 'sruth-tarsk', name: 'Sruth Tarsk', x: 470, z: -2500, length: 900, width: 500, setDeg: 0, peakKn: 9, periodH: 6, phaseH: 0, waveFactor: 1.8, knocks: 4 },
  ],
};
