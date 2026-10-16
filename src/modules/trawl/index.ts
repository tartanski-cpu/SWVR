/**
 * Module fishing.trawl: the trawl net and its warps (modular boats M5a). Shot and hauled by
 * the TRAWL switch ('trawl.shoot'), or worked by hand from the A-frame ('net.payOut' /
 * 'net.haul'), on deck hydraulics; it hangs from the boat's trawl gantry. The fishing itself
 * (grounds, speed, the catch, the net's drag on her) is the world's (fishing/fishing.ts),
 * which fishes with whichever boat has a trawl. The net in the water is drawn by the app
 * (fishing/trawlView.ts): it lies astern in the world, not on the boat.
 */
import type { ModuleDefinition } from '../../modular/module';

export const TRAWL: ModuleDefinition<Record<string, never>> = {
  id: 'fishing.trawl',
  version: 1,
  fits: ['deck.equipment'],
  defaults: {},
  ports: {
    shoot: { dir: 'read', key: 'trawl.shoot', required: false },
    payOut: { dir: 'read', key: 'net.payOut', required: false },
    haul: { dir: 'read', key: 'net.haul', required: false },
  },
  needs: () => [{ gear: 'trawlGantry' }, { power: 'hydraulic' }],
  provides: () => [{ gear: 'trawl' }],
  gear: () => ({ trawl: {} }),
};
