/**
 * Module deck.cleat: a mooring cleat on the bulwark top (modular boats M5b). A horn cleat,
 * forward or aft, port or starboard (its config). Alongside a berth, a press sends its line
 * ashore to the nearest bollard; with the line fast, a press lets it go. The workboat has
 * four: forward and aft, each side; and two amidships at the fore end of the working deck
 * that take only the skiff's painter (`end: 'midship'`: a press leads the painter there, or
 * lets it go; vessel/physics/painter.ts).
 *
 * It gives the boat a bow or a stern cleat: where on her the line acts (vessel/physics/
 * mooring.ts pulls her in to the berth by them). She moors only with both. Drawn in the
 * boat's axes on the bulwark top at its station (`stations`, the vessel's mooring config
 * until M6), the rope turns showing while its line is fast.
 */
import { CONFIG } from '../../config';
import { Cleat } from '../../controls/deckGear';
import type { ModuleDefinition } from '../../modular/module';

const mo = CONFIG.vessels.workboat.mooring;

export interface CleatConfig {
  /** Forward (it takes the bow line), aft (the stern line), or amidships (the skiff's painter). */
  end: 'bow' | 'stern' | 'midship';
  /** -1 port, +1 starboard. */
  side: -1 | 1;
  /** The cleats' stations (z, m) forward and aft, and the lines' height on her. */
  stations: { bow: number; stern: number; midship: number };
  lineY: number;
}

/** The mooring and painter code's number for a cleat: 0 forward port, 1 forward starboard, 2 aft port, 3 aft starboard, 4 and 5 amidships. */
export const cleatIndex = (c: CleatConfig): number => ({ bow: 0, stern: 2, midship: 4 })[c.end] + (c.side > 0 ? 1 : 0);

export const CLEAT: ModuleDefinition<CleatConfig> = {
  id: 'deck.cleat',
  version: 1,
  fits: ['deck.fitting'],
  defaults: { end: 'bow', side: -1, stations: { bow: mo.cleatFwdZ, stern: mo.cleatAftZ, midship: mo.cleatMidZ }, lineY: mo.lineY },
  validateConfig: (c) => [...(['bow', 'stern', 'midship'].includes(c.end) ? [] : ["end is 'bow', 'stern' or 'midship'"]), ...(c.side === -1 || c.side === 1 ? [] : ['side is -1 (port) or 1 (starboard)'])],
  ports: {},
  // The mooring lines' cleats give the boat a bow or stern cleat; the midship ones only take the painter.
  provides: (c) => (c.end === 'midship' ? [] : [{ gear: c.end === 'bow' ? 'bowCleat' : 'sternCleat' }]),
  gear: (c) => (c.end === 'bow' ? { bowCleat: { z: c.stations.bow, lineY: c.lineY } } : c.end === 'stern' ? { sternCleat: { z: c.stations.stern, lineY: c.lineY } } : {}),
  view: {
    frame: 'boat',
    build({ config: c, hull }) {
      const z = c.stations[c.end];
      const cleat =
        c.end === 'midship'
          ? new Cleat(cleatIndex(c), { channel: 'painterCleat', label: `Skiff's painter (${c.side < 0 ? 'port' : 'starboard'} midship cleat): lead it here / let go` })
          : new Cleat(cleatIndex(c));
      cleat.root.position.set(c.side * (hull.halfBeam(z) - 0.03), hull.bulwarkTop(z), z);
      return { staticParts: [], movingParts: [], controls: [cleat], update: () => {} };
    },
  },
};
