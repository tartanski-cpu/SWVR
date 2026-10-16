/**
 * Module furniture.whiteboard: the crew's whiteboard (modular boats M3c), for sticky notes
 * written in the game. The notes are the world's (shared between the crew), and writing
 * on it is the app's: both go through its `api` (the BoardView). Its frame and pen tray are
 * merged with the bridge's fixed parts.
 */
import { BoardView } from '../../board/boardView';
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';

export type WhiteboardConfig = typeof CONFIG.modules.whiteboard;

export const WHITEBOARD: ModuleDefinition<WhiteboardConfig> = {
  id: 'furniture.whiteboard',
  version: 1,
  fits: ['wall.panel', 'cabin.furniture'],
  defaults: CONFIG.modules.whiteboard,
  physical: (c) => ({ size: [c.width, c.height, 0.06] }),
  ports: {},
  view: {
    build({ config }) {
      const board = new BoardView(config.width, config.height);
      return { staticParts: board.fixedParts, movingParts: [board.root], controls: [], update: () => {}, api: board };
    },
  },
};
