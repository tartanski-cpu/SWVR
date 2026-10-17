/**
 * Module deck.tender-crane: the knuckle-boom crane on the foredeck that launches and
 * recovers the ship's skiff, with her cradle (modular boats M5a). One press on any of its
 * buttons (on the column's control box, SKIFF CRANE on the helm console, a remote in the
 * skiff) launches her from the cradle or recovers her from alongside, on deck hydraulics.
 *
 * It gives the boat a tender crane: its geometry and its launch and recovery path, which
 * the world's tender system follows (vessel/tenderCrane.ts). Its view (controls/
 * TenderCraneView.ts) poses the arm with the mechanism library's arm solver. The skiff it
 * carries is given to it by the app (`api.attach`): a recipe can't know which boat that is;
 * her buttons, remote and tarpaulin come with her.
 *
 * Placeable (owner): its socket (any deck.equipment socket) is the foot of its column, and
 * the cradle, the launch path and the buttons move with it (placeTenderCrane); on a socket to
 * port of the centreline it's mirrored, the cradle to starboard of the column and the skiff
 * going over the port side. Drawn in the boat's axes from its config so placed (defaults:
 * CONFIG.vessels.workboat.tenderCrane, the starting workboat's, where her socket is); the
 * column, saddles and control box are merged with the boat's fixed parts. The SKIFF CRANE
 * button on the helm console is where the recipe says (`consoleButton`), or left off (null).
 * Any boat with it carries a skiff (core/world.ts).
 */
import { CONFIG } from '../../config';
import { TenderCraneView } from '../../controls/TenderCraneView';
import type { ModuleDefinition } from '../../modular/module';
import { placeTenderCrane, type TenderCrane } from '../../vessel/tenderCrane';

export type TenderCraneConfig = TenderCrane & {
  /** Where its SKIFF CRANE button stands on the helm console (the boat's axes); null: none. */
  consoleButton: readonly [number, number, number] | null;
};

export const TENDER_CRANE: ModuleDefinition<TenderCraneConfig> = {
  id: 'deck.tender-crane',
  version: 1,
  fits: ['deck.equipment'],
  defaults: { ...CONFIG.vessels.workboat.tenderCrane, consoleButton: CONFIG.vessels.workboat.bridge.craneButton as TenderCraneConfig['consoleButton'] },
  validateConfig: (c) => (c.boom > 0 && c.jib > 0 ? [] : ['the boom and the jib need lengths']),
  ports: {},
  needs: () => [{ power: 'hydraulic' }],
  provides: () => [{ gear: 'tenderCrane' }],
  gear: (c, _hull, at) => ({ tenderCrane: placeTenderCrane(c, at([0, 0, 0])) }),
  // The cradle (with her in it) and the column: you walk round them, and cargo can't stand there.
  footprints: (config, _hull, at) => {
    const c = placeTenderCrane(config, at([0, 0, 0]));
    return [
      { x0: c.stow[0] - c.cradle.halfWidth, x1: c.stow[0] + c.cradle.halfWidth, z0: c.cradle.z0, z1: c.cradle.z1, top: c.stow[1] + 0.6 },
      { x: c.column[0], z: c.column[1], r: c.columnRadius, top: c.shoulderY },
    ];
  },
  view: {
    frame: 'boat',
    build({ config, hull, socket }) {
      // Its socket's place (a hull's deck.equipment socket: in the boat's axes).
      const c = placeTenderCrane(config, socket.transform.position);
      const crane = new TenderCraneView(c, hull.deckY, c.consoleButton);
      return {
        staticParts: crane.fixedParts,
        movingParts: [crane.root],
        // Its buttons come with the skiff (api.attach); the app hands them to the interaction system.
        controls: [],
        labels: c.consoleButton ? [{ text: 'SKIFF CRANE', at: [...c.consoleButton] }] : [],
        update: () => {},
        api: crane,
      };
    },
  },
};
