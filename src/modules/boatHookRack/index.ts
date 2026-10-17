/**
 * Module rescue.boat-hook-rack: the boat hook in its clips along the port bulwark (modular
 * boats M5b). Take it out to hook a crate or a line, lay it on deck, or put it back
 * (rescue/rescueHands.ts, rescue/recovery.ts).
 *
 * It gives the boat a boat hook: where its clips are (x, y, from z0 to z1). The hook is drawn
 * by the app (rescue/rescueGearView.ts: it's held in hands and laid on deck, not only in its
 * clips); this module draws nothing of its own. Its defaults are the
 * vessel config's figures (CONFIG.vessels.workboat.rescueGear.hookStow).
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';

export interface BoatHookRackConfig {
  /** The clips: x, y, and the hook's butt and head (z0, z1), the boat's axes. */
  stow: [number, number, number, number];
}

export const BOAT_HOOK_RACK: ModuleDefinition<BoatHookRackConfig> = {
  id: 'rescue.boat-hook-rack',
  version: 1,
  fits: ['deck.fitting'],
  defaults: { stow: CONFIG.vessels.workboat.rescueGear.hookStow },
  ports: {},
  provides: () => [{ gear: 'boatHook' }],
  gear: (c) => ({ boatHook: { stow: c.stow } }),
};
