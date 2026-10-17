/**
 * Module rescue.life-ring-station: the life ring on its hook on the wheelhouse aft wall,
 * and the quarter cleat its line is made fast to (modular boats M5b). Take it off the hook,
 * throw it to someone in the water, pull them in on the line (rescue/recovery.ts).
 *
 * It gives the boat a life ring: where it hangs and where its line is made fast. The ring
 * and its line are drawn by the app (rescue/rescueGearView.ts: they fly, float and are held
 * in hands, not only on the boat); this module draws nothing of its own. Its defaults are the
 * vessel config's figures (CONFIG.vessels.workboat.rescueGear, the tunables' home).
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';

const rg = CONFIG.vessels.workboat.rescueGear;

export interface LifeRingStationConfig {
  /** Where the ring hangs (the boat's axes). */
  stow: [number, number, number];
  /** The cleat its line is made fast to. */
  cleat: [number, number, number];
}

export const LIFE_RING_STATION: ModuleDefinition<LifeRingStationConfig> = {
  id: 'rescue.life-ring-station',
  version: 1,
  fits: ['deck.fitting'],
  defaults: { stow: rg.ringStow, cleat: rg.ringCleat },
  ports: {},
  provides: () => [{ gear: 'lifeRing' }],
  gear: (c) => ({ lifeRing: { stow: c.stow, cleat: c.cleat } }),
};
