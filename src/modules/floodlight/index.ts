/**
 * Module light.flood: a deck floodlight on the wheelhouse roof edge (modular boats M6c),
 * aimed down at the deck: the foredeck's or the aft deck's (`end`), each switched from the
 * overhead panel ('lights.deckFore' / 'lights.deckAft', bound in the recipe) on the deck
 * lights' breaker. ONE real SpotLight, hidden while off (vessel/view/deckLights.ts). It
 * draws 8 A while on. Drawn in the boat's axes from its lamp and aim point.
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { Floodlight, type FloodLook } from '../../vessel/view/deckLights';
import { BREAKERS, type BreakerName } from '../../vessel/vesselState';

const dl = CONFIG.vessels.workboat.deckLights;

export interface FloodlightConfig {
  /**
   * Which of the boat's floods: its lamp and aim point (the boat's axes) from `lamps`, and its
   * own beam half-angle if it has one (the Shipyard narrows a beam that would reach inside the
   * wheelhouse: shipyard/parts/places.ts floodLamps).
   */
  end: 'fore' | 'aft';
  lamps: Record<'fore' | 'aft', Pick<FloodLook, 'position' | 'target'> & { angleDeg?: number }>;
  /** The beam: cd, m, half-angle (deg), penumbra 0..1. */
  intensity: number;
  distance: number;
  angleDeg: number;
  penumbra: number;
  amps: number;
  circuit: BreakerName;
}

export const FLOODLIGHT: ModuleDefinition<FloodlightConfig> = {
  id: 'light.flood',
  version: 1,
  fits: ['hull.light'],
  defaults: { end: 'fore', lamps: { fore: dl.fore, aft: dl.aft }, intensity: dl.intensity, distance: dl.distance, angleDeg: dl.angleDeg, penumbra: dl.penumbra, amps: 8, circuit: 'deckLights' },
  validateConfig: (c) => [
    ...(c.end === 'fore' || c.end === 'aft' ? [] : ["end is 'fore' or 'aft'"]),
    ...(c.amps >= 0 ? [] : ['amps should be 0 or more']),
    ...((BREAKERS as readonly string[]).includes(c.circuit) ? [] : [`'${c.circuit}' isn't a circuit (${BREAKERS.join(', ')})`]),
  ],
  ports: {
    on: { dir: 'read' },
    live: { dir: 'read', key: 'circuit.deckLights.live' },
  },
  needs: (c) => [{ power: 'electrical', circuit: c.circuit }],
  power: (c) => [{ role: 'load', circuit: c.circuit, amps: (io) => (io.num('on') > 0 ? c.amps : 0) }],
  view: {
    frame: 'boat',
    build({ config: c, keys }) {
      const lamp = c.lamps[c.end];
      const flood = new Floodlight({ position: lamp.position, target: lamp.target, intensity: c.intensity, distance: c.distance, angleDeg: lamp.angleDeg ?? c.angleDeg, penumbra: c.penumbra });
      return {
        staticParts: [],
        movingParts: [flood.root],
        controls: [],
        update: (read) => flood.update(read.num(keys.on) > 0 && !!read.get(keys.live)),
      };
    },
  },
};
