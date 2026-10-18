/**
 * Module deck.boat-cleat: a small boat's cleat (the skiff's), at her stem head or on her
 * quarter (owner: a stern cleat too, so she can be tied up front and back, to the ship or to
 * the quay). One press works its end's line:
 *   - fast (to the ship or ashore): let it go;
 *   - else, in a quay berth's hot spot: make it fast ashore to the berth's bollard, as the
 *     big boats' mooring lines do (vessel/physics/mooring.ts), lying `inshore` m closer to the
 *     quay than a berth's mark (a berth is marked for the workboat's beam);
 *   - else: make it fast to the ship's nearest cleat in reach (her painter, or her stern line
 *     to the ship: vessel/physics/painter.ts).
 * She moors to a quay only with both ends' cleats, like any boat.
 *
 * It gives the boat a bow or a stern cleat at its socket (the point the line pulls from is
 * `lineY` above it). Drawn from its socket: the horn cleat, turned fore and aft, its rope
 * turns showing while its line is fast. Its press is aimed at the boat it's on.
 */
import { CONFIG } from '../../config';
import { Cleat } from '../../controls/deckGear';
import type { ModuleDefinition } from '../../modular/module';

const sk = CONFIG.vessels.skiff.cleats;

export interface BoatCleatConfig {
  /** Which end's line it takes. */
  end: 'bow' | 'stern';
  /** The line's height above the cleat's base (m). */
  lineY: number;
  /** How much closer to the quay than a berth's mark she lies, moored (m). */
  inshore: number;
}

/** Its number in the painter's code: -1 her bow cleat, -2 her stern cleat. */
export const boatCleatIndex = (end: 'bow' | 'stern'): number => (end === 'bow' ? -1 : -2);

export const BOAT_CLEAT: ModuleDefinition<BoatCleatConfig> = {
  id: 'deck.boat-cleat',
  version: 1,
  fits: ['deck.fitting'],
  defaults: { end: 'bow', lineY: sk.lineY, inshore: sk.inshore },
  validateConfig: (c) => (c.end === 'bow' || c.end === 'stern' ? [] : ["end is 'bow' or 'stern'"]),
  ports: {},
  provides: (c) => [{ gear: c.end === 'bow' ? 'bowCleat' : 'sternCleat' }],
  gear: (c, _hull, at) => {
    const [x, y, z] = at([0, 0, 0]);
    return { [c.end === 'bow' ? 'bowCleat' : 'sternCleat']: { x, z, lineY: y + c.lineY, inshore: c.inshore } };
  },
  view: {
    build({ config: c }) {
      const cleat = new Cleat(boatCleatIndex(c.end), {
        id: c.end === 'bow' ? 'painter' : 'sternPainter',
        channel: 'painter',
        label: `Skiff's ${c.end === 'bow' ? 'bow line (bow cleat)' : 'stern line (stern cleat)'}: let go, or make fast ashore at a berth, or to the nearest cleat`,
      });
      return { staticParts: [], movingParts: [], controls: [cleat], update: () => {} };
    },
  },
};
