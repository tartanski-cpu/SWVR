/**
 * Module furniture.start-card: the laminated engine start-up card lying on the console
 * (modular boats M3). Drawn once; one draw call (it has its own printed texture).
 */
import { CONFIG } from '../../config';
import { checklistCard } from '../../controls/ignition';
import type { ModuleDefinition } from '../../modular/module';

export const START_CARD: ModuleDefinition<{ width: number; height: number }> = {
  id: 'furniture.start-card',
  version: 1,
  fits: ['panel.slot'],
  defaults: { ...CONFIG.modules.startCard },
  ports: {},
  view: {
    build({ config }) {
      return { staticParts: [], movingParts: [checklistCard({ position: [0, 0, 0], ...config })], controls: [], update: () => {} };
    },
  },
};
