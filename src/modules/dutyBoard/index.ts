/**
 * Module furniture.duty-board: the board on the wall listing the game's tasks and the
 * shipping forecast (modular boats M3c). Its contents are the world's (duties, the career,
 * the forecast), handed in by the app through its `api` (the DutyBoardView). Its frame is
 * merged with the bridge's fixed parts; its face is one canvas (redrawn only on change).
 */
import { CONFIG } from '../../config';
import { DutyBoardView } from '../../duties/dutyBoardView';
import type { ModuleDefinition } from '../../modular/module';

export type DutyBoardConfig = typeof CONFIG.modules.dutyBoard;

export const DUTY_BOARD: ModuleDefinition<DutyBoardConfig> = {
  id: 'furniture.duty-board',
  version: 1,
  fits: ['wall.panel', 'cabin.furniture'],
  defaults: CONFIG.modules.dutyBoard,
  physical: (c) => ({ size: [c.width, c.height, 0.03] }),
  ports: {},
  view: {
    build({ config }) {
      const board = new DutyBoardView(config);
      return { staticParts: board.fixedParts, movingParts: [board.root], controls: [], update: () => {}, api: board };
    },
  },
};
